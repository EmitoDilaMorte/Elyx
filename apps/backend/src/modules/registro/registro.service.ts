import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CondominioAltaService, TipoUnidad } from '../condominio-alta/condominio-alta.service';
import { MailService } from '../mail/mail.service';
import {
  CreateRegistroCondominioDto,
  ReenviarVerificacionDto,
} from './dto/create-registro.dto';

/** Dominios de correo desechable mas comunes. Lista corta a proposito. */
const DOMINIOS_DESECHABLES = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  '10minutemail.com',
  'yopmail.com',
  'throwawaymail.com',
  'sharklasers.com',
  'trashmail.com',
  'discard.email',
  'getnada.com',
  'maildrop.cc',
]);

const MENSAJE_GENERICO =
  'Si los datos son validos, enviamos un enlace de verificacion al correo indicado. Revisa tu bandeja de entrada y la carpeta de spam.';

type RegistroRow = Record<string, unknown>;

@Injectable()
export class RegistroService {
  private readonly logger = new Logger(RegistroService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly alta: CondominioAltaService,
    private readonly mailService: MailService,
  ) {}

  /** El frontend lo usa para decidir si muestra "Crea tu condominio". */
  disponibilidad() {
    return {
      disponible: this.estaHabilitado(),
      suscripcionRequerida: process.env.SUSCRIPCION_ENABLED === 'true',
    };
  }

  async crearRegistro(
    input: CreateRegistroCondominioDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true; message: string }> {
    this.assertHabilitado();

    const correo = input.correoAdmin.trim().toLowerCase();
    const dominio = correo.split('@')[1] ?? '';
    if (DOMINIOS_DESECHABLES.has(dominio)) {
      throw new BadRequestException(
        'Usa un correo institucional o personal permanente: los correos temporales no son aceptados.',
      );
    }

    // Si la cuenta ya existe se reutiliza al verificar y se conserva su
    // contrasena actual. Se avisa en el correo (solo lo lee el dueño del
    // buzon, asi que no revela nada a terceros).
    const cuentaExistente = await this.correoYaRegistrado(correo);

    // Un solo registro pendiente por correo: se reemplaza al reenviar.
    await this.dataSource.query(
      `
      UPDATE registros_condominio
      SET estado = 'EXPIRADO', actualizado_en = NOW()
      WHERE LOWER(correo_admin) = $1
        AND estado = 'PENDIENTE_VERIFICACION'
      `,
      [correo],
    );

    const { token, tokenHash } = this.generarToken();
    const horas = this.horasExpiracion();
    const expiracion = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
    const passwordHash = await this.alta.hashearPassword(input.password);
    const periodo = this.resolverPeriodo(input.periodoInicial, input.diaLimitePago);

    await this.dataSource.query(
      `
      INSERT INTO registros_condominio (
        nombre_condominio,
        direccion_condominio,
        cupo_unidades,
        prefijo_unidad,
        tipo_unidad,
        monto_cuota,
        recargo_por_dia,
        dia_limite_pago,
        periodo_inicial,
        nombre_admin,
        apellido_paterno_admin,
        apellido_materno_admin,
        correo_admin,
        telefono_admin,
        password_hash,
        token_hash,
        expiracion,
        estado,
        ip,
        user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'PENDIENTE_VERIFICACION',$18,$19)
      `,
      [
        input.nombreCondominio.trim(),
        input.direccionCondominio?.trim() || null,
        input.numeroUnidades,
        // El prefijo se guarda tal cual: el espacio final de "Depto " es
        // intencional y forma parte de la clave ("Depto 1").
        input.prefijoUnidad && input.prefijoUnidad.trim().length > 0 ? input.prefijoUnidad : '',
        input.tipoUnidad,
        input.montoCuota,
        input.recargoPorDia,
        input.diaLimitePago,
        periodo,
        input.nombreAdmin.trim(),
        input.apellidoPaternoAdmin.trim(),
        input.apellidoMaternoAdmin?.trim() || null,
        correo,
        input.telefonoAdmin?.trim() || null,
        passwordHash,
        tokenHash,
        expiracion,
        meta.ip ?? null,
        meta.userAgent ?? null,
      ],
    );

    await this.enviarCorreoVerificacion({
      correo,
      nombre: input.nombreAdmin,
      nombreCondominio: input.nombreCondominio,
      token,
      horas,
      cuentaExistente,
    });

    // Respuesta identica exista o no la cuenta: no se filtra nada.
    return { ok: true, message: MENSAJE_GENERICO };
  }

  async reenviarVerificacion(
    input: ReenviarVerificacionDto,
  ): Promise<{ ok: true; message: string }> {
    this.assertHabilitado();

    const correo = input.correo.trim().toLowerCase();
    const rows = await this.dataSource.query(
      `
      SELECT id_registro, nombre_admin, nombre_condominio, dia_limite_pago, expiracion
      FROM registros_condominio
      WHERE LOWER(correo_admin) = $1
        AND estado = 'PENDIENTE_VERIFICACION'
      ORDER BY id_registro DESC
      LIMIT 1
      `,
      [correo],
    );

    if (rows.length === 0) {
      return { ok: true, message: MENSAJE_GENERICO };
    }

    const registro = rows[0] as RegistroRow;
    const { token, tokenHash } = this.generarToken();
    const horas = this.horasExpiracion();
    const expiracion = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();

    await this.dataSource.query(
      `
      UPDATE registros_condominio
      SET token_hash = $2, expiracion = $3, actualizado_en = NOW()
      WHERE id_registro = $1
      `,
      [Number(registro.id_registro), tokenHash, expiracion],
    );

    await this.enviarCorreoVerificacion({
      correo,
      nombre: String(registro.nombre_admin ?? ''),
      nombreCondominio: String(registro.nombre_condominio ?? ''),
      token,
      horas,
      cuentaExistente: await this.correoYaRegistrado(correo),
    });

    return { ok: true, message: MENSAJE_GENERICO };
  }

  /**
   * Verifica el correo y crea el condominio, el administrador, las unidades y
   * la cuota inicial en una sola transaccion. Es idempotente: repetir el mismo
   * token devuelve el resultado ya creado en lugar de duplicar el condominio.
   */
  async verificarToken(rawToken: string): Promise<{
    ok: true;
    idCondominio: number;
    nombreCondominio: string;
    estadoCondominio: string;
    unidadesCreadas: number;
    cuotasCreadas: number;
    requierePago: boolean;
  }> {
    this.assertHabilitado();

    const tokenHash = this.hashear(rawToken);

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        SELECT *
        FROM registros_condominio
        WHERE token_hash = $1
        FOR UPDATE
        `,
        [tokenHash],
      );

      if (rows.length === 0) {
        throw new NotFoundException('El enlace de verificacion no es valido.');
      }

      const registro = rows[0] as RegistroRow;
      const estadoRegistro = String(registro.estado ?? '');

      // Idempotencia: si ya se proceso, devolvemos el condominio creado.
      if (estadoRegistro === 'COMPLETADO' && registro.id_condominio) {
        return {
          ok: true as const,
          idCondominio: Number(registro.id_condominio),
          nombreCondominio: String(registro.nombre_condominio ?? ''),
          estadoCondominio: process.env.SUSCRIPCION_ENABLED === 'true'
            ? 'PENDIENTE_PAGO'
            : 'ACTIVO',
          unidadesCreadas: 0,
          cuotasCreadas: 0,
          requierePago: process.env.SUSCRIPCION_ENABLED === 'true',
        };
      }

      if (estadoRegistro !== 'PENDIENTE_VERIFICACION') {
        throw new BadRequestException(
          'Este enlace de verificacion ya no es valido. Solicita uno nuevo.',
        );
      }

      if (new Date(String(registro.expiracion)).getTime() < Date.now()) {
        await manager.query(
          `UPDATE registros_condominio SET estado = 'EXPIRADO', actualizado_en = NOW() WHERE id_registro = $1`,
          [Number(registro.id_registro)],
        );
        throw new BadRequestException(
          'El enlace de verificacion expiro. Solicita uno nuevo desde la pantalla de registro.',
        );
      }

      const requierePago = process.env.SUSCRIPCION_ENABLED === 'true';
      const cupoUnidades = Number(registro.cupo_unidades);
      const estadoCondominio = requierePago ? 'PENDIENTE_PAGO' : 'ACTIVO';

      const idCondominio = await this.alta.crearCondominio(manager, {
        nombre: String(registro.nombre_condominio ?? ''),
        direccion: registro.direccion_condominio
          ? String(registro.direccion_condominio)
          : null,
        estado: estadoCondominio,
        cupoUnidades,
      });

      const usuario = await this.alta.findOrCreateUsuario(manager, {
        nombre: String(registro.nombre_admin ?? ''),
        apellidoPaterno: String(registro.apellido_paterno_admin ?? ''),
        apellidoMaterno: registro.apellido_materno_admin
          ? String(registro.apellido_materno_admin)
          : null,
        correo: String(registro.correo_admin ?? ''),
        passwordHash: String(registro.password_hash ?? ''),
      });

      const idUsuarioCondominio = await this.alta.ensureMembresia(
        manager,
        usuario.idUsuario,
        idCondominio,
        'ADMINISTRADOR',
      );

      const unidades = this.alta.generarUnidadesDesdePatron(
        String(registro.prefijo_unidad ?? ''),
        cupoUnidades,
        String(registro.tipo_unidad ?? 'DEPARTAMENTO') as TipoUnidad,
      );

      const creadas = await this.alta.crearUnidades(manager, idCondominio, unidades);

      const cuotasCreadas = await this.alta.crearCuotasIniciales(manager, idCondominio, {
        periodo: String(registro.periodo_inicial ?? ''),
        monto: Number(registro.monto_cuota ?? 0),
        recargoPorDia: Number(registro.recargo_por_dia ?? 0),
        diaLimite: Number(registro.dia_limite_pago ?? 10),
      });

      if (requierePago) {
        await manager.query(
          `
          INSERT INTO suscripciones_condominio (
            id_condominio, plan, cupo_unidades, periodo, monto, moneda,
            estado, proveedor, referencia_pago
          )
          VALUES ($1, 'ESTANDAR', $2, 'MENSUAL', $3, 'MXN', 'PENDIENTE', $4, $5)
          ON CONFLICT (id_condominio) DO NOTHING
          `,
          [
            idCondominio,
            cupoUnidades,
            this.montoSuscripcion(),
            process.env.SUSCRIPCION_PROVIDER ?? 'MANUAL',
            this.generarReferencia(idCondominio),
          ],
        );
      }

      await manager.query(
        `
        UPDATE registros_condominio
        SET estado = 'COMPLETADO', verificado_en = NOW(), id_condominio = $2, actualizado_en = NOW()
        WHERE id_registro = $1
        `,
        [Number(registro.id_registro), idCondominio],
      );

      await this.alta.notificarAlta(manager, {
        idCondominio,
        idUsuarioCondominio,
        asunto: requierePago ? 'Condominio creado - falta el pago' : 'Condominio creado',
        mensaje: requierePago
          ? `Tu condominio "${String(registro.nombre_condominio ?? '')}" fue creado. Activa la suscripcion para invitar a los condominos.`
          : `Tu condominio "${String(registro.nombre_condominio ?? '')}" fue creado con ${cupoUnidades} unidades. Ya puedes generar el enlace de invitacion.`,
        tipo: requierePago ? 'SUSCRIPCION_PENDIENTE' : 'ALTA_INICIAL_USUARIO',
      });

      return {
        ok: true as const,
        idCondominio,
        nombreCondominio: String(registro.nombre_condominio ?? ''),
        estadoCondominio,
        unidadesCreadas: creadas.length,
        cuotasCreadas,
        requierePago,
      };
    });
  }

  async estadoRegistro(idRegistro: number) {
    const rows = await this.dataSource.query(
      `
      SELECT id_registro, nombre_condominio, estado, expiracion, id_condominio
      FROM registros_condominio
      WHERE id_registro = $1
      `,
      [idRegistro],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el registro indicado.');
    }

    const row = rows[0] as RegistroRow;
    return {
      idRegistro: Number(row.id_registro),
      nombreCondominio: String(row.nombre_condominio ?? ''),
      estado: String(row.estado ?? ''),
      expiracion: row.expiracion,
      idCondominio: row.id_condominio ? Number(row.id_condominio) : null,
    };
  }

  /** Purga los registros abandonados: sin verificar y ya vencidos. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgarRegistrosVencidos(): Promise<void> {
    try {
      const result = await this.dataSource.query(
        `
        UPDATE registros_condominio
        SET estado = 'EXPIRADO', actualizado_en = NOW()
        WHERE estado = 'PENDIENTE_VERIFICACION'
          AND expiracion < NOW()
        RETURNING id_registro
        `,
      );
      const total = Array.isArray(result) ? result.length : 0;
      if (total > 0) {
        this.logger.log(`Registros de condominio expirados: ${total}`);
      }
    } catch (error) {
      this.logger.error('No fue posible purgar los registros vencidos.', error as Error);
    }
  }

  private async enviarCorreoVerificacion(input: {
    correo: string;
    nombre: string;
    nombreCondominio: string;
    token: string;
    horas: number;
    cuentaExistente?: boolean;
  }): Promise<void> {
    // Igual que en el resto de la app: si el correo falla no se rompe el alta,
    // el usuario siempre puede pedir un reenvio.
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .replace(/\/+$/, '');
    const url = `${base}/crear-condominio/verificar?token=${input.token}`;

    const avisoCuenta = input.cuentaExistente
      ? `<p style="background:#fff7e6;border:1px solid #f0d9a8;padding:12px;border-radius:8px;">
           <strong>Ya tienes una cuenta en Elyx con este correo.</strong><br/>
           Al confirmar, se agregara tu acceso como administrador del nuevo condominio y
           <strong>conservaras tu contrasena actual</strong> (la que escribiste en el formulario
           no se aplicara).
         </p>`
      : '';

    const html = `
      <h2>Confirma tu correo - Elyx</h2>
      <p>Hola ${input.nombre},</p>
      <p>Recibimos la solicitud para crear el condominio <strong>${input.nombreCondominio}</strong> en Elyx.</p>
      ${avisoCuenta}
      <p>Confirma tu correo para continuar (el enlace vence en ${input.horas} horas):</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Confirmar y crear mi condominio</a></p>
      <p>O copia este enlace en tu navegador:</p>
      <p>${url}</p>
      <p>Si no solicitaste este registro, puedes ignorar este mensaje.</p>
      <hr/>
      <p style="color:#888;">Elyx - Plataforma condominal</p>
    `;

    const enviado = await this.mailService.sendEmail(
      input.correo,
      'Confirma tu correo para crear tu condominio en Elyx',
      html,
    );

    if (!enviado) {
      this.logger.warn(`No se pudo enviar el correo de verificacion a ${input.correo}`);
    }
  }

  private assertHabilitado(): void {
    if (!this.estaHabilitado()) {
      throw new NotFoundException('El registro publico de condominios no esta disponible.');
    }
  }

  /**
   * Alta de un condominio por parte de un usuario YA autenticado.
   *
   * Resuelve el problema del correo existente: la identidad ya esta probada por
   * la sesion, asi que no hace falta verificar el buzon ni pedir contrasena. El
   * condominio se crea al instante y el solicitante queda como administrador.
   *
   * Con `SUSCRIPCION_ENABLED=true` el condominio nace `PENDIENTE_PAGO`, igual
   * que en el flujo publico.
   */
  async crearComoAdmin(
    idUsuario: number,
    input: Omit<CreateRegistroCondominioDto, 'password' | 'correoAdmin' | 'nombreAdmin' | 'apellidoPaternoAdmin' | 'apellidoMaternoAdmin'> & {
      nombreCondominio: string;
      numeroUnidades: number;
      tipoUnidad: TipoUnidad;
    },
  ): Promise<{
    ok: true;
    idCondominio: number;
    nombreCondominio: string;
    estadoCondominio: string;
    unidadesCreadas: number;
    cuotasCreadas: number;
    requierePago: boolean;
  }> {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      throw new BadRequestException('No fue posible identificar al usuario autenticado.');
    }

    const usuarioRows = await this.dataSource.query(
      `
      SELECT u.id_usuario, u.correo, u.nombre, u.primer_apellido, u.segundo_apellido
      FROM usuarios u
      WHERE u.id_usuario = $1
      LIMIT 1
      `,
      [idUsuario],
    );

    if (usuarioRows.length === 0) {
      throw new NotFoundException('No se encontro el usuario autenticado.');
    }

    const usuario = usuarioRows[0] as RegistroRow;
    const requierePago = process.env.SUSCRIPCION_ENABLED === 'true';
    const estadoCondominio = requierePago ? 'PENDIENTE_PAGO' : 'ACTIVO';
    const periodo = this.resolverPeriodo(input.periodoInicial, input.diaLimitePago);

    return this.dataSource.transaction(async (manager) => {
      const idCondominio = await this.alta.crearCondominio(manager, {
        nombre: input.nombreCondominio,
        direccion: input.direccionCondominio ?? null,
        estado: estadoCondominio,
        cupoUnidades: input.numeroUnidades,
      });

      const idUsuarioCondominio = await this.alta.ensureMembresia(
        manager,
        idUsuario,
        idCondominio,
        'ADMINISTRADOR',
      );

      const unidades = this.alta.generarUnidadesDesdePatron(
        input.prefijoUnidad ?? '',
        input.numeroUnidades,
        input.tipoUnidad,
      );

      const creadas = await this.alta.crearUnidades(manager, idCondominio, unidades);

      const cuotasCreadas = await this.alta.crearCuotasIniciales(manager, idCondominio, {
        periodo,
        monto: input.montoCuota,
        recargoPorDia: input.recargoPorDia,
        diaLimite: input.diaLimitePago,
      });

      if (requierePago) {
        await manager.query(
          `
          INSERT INTO suscripciones_condominio (
            id_condominio, plan, cupo_unidades, periodo, monto, moneda,
            estado, proveedor, referencia_pago
          )
          VALUES ($1, 'ESTANDAR', $2, 'MENSUAL', $3, 'MXN', 'PENDIENTE', $4, $5)
          ON CONFLICT (id_condominio) DO NOTHING
          `,
          [
            idCondominio,
            input.numeroUnidades,
            this.montoSuscripcion(),
            process.env.SUSCRIPCION_PROVIDER ?? 'MANUAL',
            this.generarReferencia(idCondominio),
          ],
        );
      }

      await this.alta.notificarAlta(manager, {
        idCondominio,
        idUsuarioCondominio,
        asunto: requierePago ? 'Condominio creado - falta el pago' : 'Condominio creado',
        mensaje: requierePago
          ? `Creaste el condominio "${input.nombreCondominio}". Activa la suscripcion para invitar condominos.`
          : `Creaste el condominio "${input.nombreCondominio}" con ${input.numeroUnidades} unidades.`,
        tipo: requierePago ? 'SUSCRIPCION_PENDIENTE' : 'ALTA_INICIAL_USUARIO',
      });

      return {
        ok: true as const,
        idCondominio,
        nombreCondominio: input.nombreCondominio,
        estadoCondominio,
        unidadesCreadas: creadas.length,
        cuotasCreadas,
        requierePago,
      };
    });
  }

  private async correoYaRegistrado(correo: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1`,
      [correo.toLowerCase()],
    );
    return rows.length > 0;
  }

  private estaHabilitado(): boolean {
    return process.env.REGISTRO_PUBLICO_ENABLED === 'true';
  }

  private horasExpiracion(): number {
    const valor = Number(process.env.REGISTRO_EXPIRACION_HORAS ?? 24);
    return Number.isFinite(valor) && valor > 0 ? valor : 24;
  }

  private montoSuscripcion(): number {
    const valor = Number(process.env.SUSCRIPCION_MONTO_BASE ?? 0);
    return Number.isFinite(valor) && valor >= 0 ? valor : 0;
  }

  private generarReferencia(idCondominio: number): string {
    return `ELYX-${new Date().getFullYear()}-${String(idCondominio).padStart(6, '0')}`;
  }

  private generarToken(): { token: string; tokenHash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: this.hashear(token) };
  }

  private hashear(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Si el dia limite del mes en curso ya paso, la cuota inicial nace vencida.
   * En ese caso se usa el mes siguiente.
   */
  private resolverPeriodo(periodoInicial: string | undefined, diaLimitePago: number): string {
    const ahora = new Date();
    let year = ahora.getFullYear();
    let month = ahora.getMonth() + 1;

    if (periodoInicial) {
      const [y, m] = periodoInicial.split('-').map(Number);
      year = y;
      month = m;
    } else {
      const finDeMes = new Date(year, month - 1, diaLimitePago);
      const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      if (finDeMes < hoy) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }

    return `${year}-${String(month).padStart(2, '0')}`;
  }
}
