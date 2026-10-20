import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BehaviorBatchDto } from './dto/behavior-batch.dto';

export type Veredicto = 'human' | 'suspicious' | 'bot';

export type ResumenComportamiento = {
  sessionId: string;
  score: number;
  verdict: Veredicto;
  reasons: string[];
  metricas: {
    movimientos: number;
    teclas: number;
    clics: number;
    desviacionTeclasMs: number;
    tiempoFormularioMs: number;
    webdriver: boolean | null;
  };
};

type FilaBehavior = {
  session_id: string;
  score: number;
  verdict: Veredicto;
  payload: Record<string, unknown> | null;
  creado_en: string;
};

function desviacionEstandar(valores: number[]): number {
  if (valores.length < 2) {
    return 0;
  }
  const media = valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const varianza = valores.reduce((total, valor) => total + (valor - media) ** 2, 0) / valores.length;
  return Math.sqrt(varianza);
}

/**
 * Puntua la telemetria del navegador. Es una heuristica deliberadamente
 * explicita: cada componente del score se devuelve con su motivo, de modo que
 * la demo pueda enseñar *por que* una sesion parece humana o automatizada.
 *
 * No se guarda ningun valor de campo: solo tipos de evento, tiempos y
 * coordenadas relativas.
 */
@Injectable()
export class BehaviorService {
  private readonly logger = new Logger(BehaviorService.name);

  constructor(private readonly dataSource: DataSource) {}

  puntuar(dto: BehaviorBatchDto): ResumenComportamiento {
    const movimientos = dto.eventos.filter((evento) => evento.tipo === 'mousemove');
    const teclas = dto.eventos.filter((evento) => evento.tipo === 'keydown');
    const clics = dto.eventos.filter((evento) => evento.tipo === 'pointerdown');

    const deltasTeclas = teclas.map((evento) => Number(evento.dt ?? 0)).filter((valor) => valor > 0);
    const desviacion = desviacionEstandar(deltasTeclas);
    const tiempoFormulario = Number(dto.tiempoFormularioMs ?? 0);

    let score = 0;
    const reasons: string[] = [];

    if (movimientos.length >= 20) {
      score += 25;
      reasons.push(`+25 ${movimientos.length} movimientos de cursor`);
    } else {
      reasons.push(`+0 solo ${movimientos.length} movimientos de cursor (se esperan >= 20)`);
    }

    if (teclas.length >= 5) {
      score += 15;
      reasons.push(`+15 ${teclas.length} pulsaciones de teclado`);
    } else {
      reasons.push(`+0 solo ${teclas.length} pulsaciones (se esperan >= 5)`);
    }

    if (deltasTeclas.length >= 3 && desviacion >= 15) {
      score += 10;
      reasons.push(`+10 ritmo de tecleo variable (desviacion ${desviacion.toFixed(1)} ms)`);
    } else {
      reasons.push(`+0 ritmo de tecleo constante o insuficiente (desviacion ${desviacion.toFixed(1)} ms)`);
    }

    if (tiempoFormulario >= 2000) {
      score += 15;
      reasons.push(`+15 ${(tiempoFormulario / 1000).toFixed(1)} s en el formulario`);
    } else {
      reasons.push(`+0 tiempo en el formulario demasiado corto (${(tiempoFormulario / 1000).toFixed(1)} s)`);
    }

    if (clics.length > 0) {
      score += 5;
      reasons.push(`+5 ${clics.length} clics`);
    }

    if (dto.webdriver === false) {
      score += 20;
      reasons.push('+20 navigator.webdriver ausente');
    } else if (dto.webdriver === true) {
      score -= 25;
      reasons.push('-25 navigator.webdriver presente');
    }

    // Trayectoria con jitter: un script que mueve el raton en linea recta
    // produce coordenadas casi identicas en cada paso.
    const ys = movimientos.map((evento) => Number(evento.y ?? 0));
    const jitter = desviacionEstandar(ys);
    if (movimientos.length >= 10 && jitter > 1.5) {
      score += 10;
      reasons.push(`+10 trayectoria con variacion (${jitter.toFixed(1)} px)`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const verdict: Veredicto = score >= 70 ? 'human' : score >= 40 ? 'suspicious' : 'bot';

    return {
      sessionId: dto.sessionId,
      score,
      verdict,
      reasons,
      metricas: {
        movimientos: movimientos.length,
        teclas: teclas.length,
        clics: clics.length,
        desviacionTeclasMs: Number(desviacion.toFixed(1)),
        tiempoFormularioMs: tiempoFormulario,
        webdriver: dto.webdriver ?? null,
      },
    };
  }

  async registrar(
    dto: BehaviorBatchDto,
    meta: { ip?: string; userAgent?: string; idUsuario?: number },
  ): Promise<ResumenComportamiento> {
    const resumen = this.puntuar(dto);

    try {
      await this.dataSource.query(
        `
        INSERT INTO behavior_events
          (session_id, id_usuario, ruta, tipo, payload, score, verdict, ip, user_agent)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
        `,
        [
          dto.sessionId,
          meta.idUsuario ?? null,
          (dto.ruta ?? '').slice(0, 255) || null,
          'batch',
          JSON.stringify({
            eventos: dto.eventos.slice(0, 200),
            metricas: resumen.metricas,
            reasons: resumen.reasons,
          }),
          resumen.score,
          resumen.verdict,
          meta.ip ?? null,
          (meta.userAgent ?? '').slice(0, 255) || null,
        ],
      );
    } catch (error) {
      // La telemetria nunca debe romper la experiencia del usuario.
      this.logger.warn(`No se pudo guardar la telemetria: ${String(error)}`);
    }

    return resumen;
  }

  async resumenSesion(sessionId: string): Promise<ResumenComportamiento | null> {
    const rows = (await this.dataSource.query(
      `
      SELECT session_id, score, verdict, payload, creado_en
      FROM behavior_events
      WHERE session_id = $1
      ORDER BY creado_en DESC
      LIMIT 1
      `,
      [sessionId],
    )) as FilaBehavior[];

    if (rows.length === 0) {
      return null;
    }

    const fila = rows[0];
    const payload = fila.payload ?? {};
    return {
      sessionId: fila.session_id,
      score: Number(fila.score),
      verdict: fila.verdict,
      reasons: Array.isArray(payload.reasons) ? (payload.reasons as string[]) : [],
      metricas: (payload.metricas as ResumenComportamiento['metricas']) ?? {
        movimientos: 0,
        teclas: 0,
        clics: 0,
        desviacionTeclasMs: 0,
        tiempoFormularioMs: 0,
        webdriver: null,
      },
    };
  }
}
