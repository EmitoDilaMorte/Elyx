import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { CupoService } from '../cupo/cupo.service';
import type {
  CondominioPublico,
  PaginaInvitacion,
  ResolucionInvitacion,
} from './publico.types';

/**
 * Texto por defecto cuando el condominio no capturo una descripcion.
 *
 * Se usa **solo** si `condominios.descripcion_publica` esta vacio; lo normal es
 * que cada condominio escriba la suya. El texto es deliberadamente generico:
 * describe el servicio que se cobra y la plataforma que lo administra, sin
 * inventar amenidades ni servicios que el condominio no presta. Stripe revisa
 * esta pagina y la descripcion debe coincidir con lo que realmente se ofrece.
 */
const DESCRIPCION_POR_DEFECTO =
  'Administración de cuotas de mantenimiento del condominio a través de Elyx, la plataforma ' +
  'donde los condóminos consultan su estado de cuenta, pagan en línea con transferencia o ' +
  'tarjeta y reciben los avisos del administrador.';

/**
 * Datos publicos del condominio.
 *
 * Alimenta la pagina `/condominio/:id`, que cumple dos funciones:
 *
 *  1. **Requisito de Stripe.** Al crear una cuenta conectada, Stripe exige una
 *     URL publica del negocio con el nombre, la descripcion de los servicios y
 *     datos de contacto de atencion al cliente. Esta pagina es esa URL, y por
 *     eso se genera desde la base en lugar de pedirle al administrador que
 *     invente un sitio.
 *  2. **Punto de entrada de la invitacion.** Si se llega con un token valido,
 *     la misma pagina ofrece unirse al condominio.
 *
 * **Todo lo que devuelve este servicio es publico.** No se expone la direccion,
 * ni datos del administrador, ni unidades, ni importes: la pagina se sirve sin
 * autenticacion y Stripe la revisa periodicamente.
 */
@Injectable()
export class PublicoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cupoService: CupoService,
  ) {}

  /**
   * Datos de la pagina publica.
   *
   * Devuelve 404 tanto si el condominio no existe como si su pagina esta
   * desactivada: distinguir ambos casos revelaria que IDs existen.
   */
  async obtenerCondominio(idCondominio: number): Promise<CondominioPublico> {
    const condominio = await this.leerCondominio(idCondominio);
    if (!condominio) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }
    return condominio;
  }

  /**
   * Resuelve un enlace de invitacion a la pagina completa.
   *
   * El token es la unica credencial: la URL no incluye el id del condominio, que
   * seria un dato interno en un enlace publico. Por eso esta llamada devuelve el
   * condominio y el estado juntos.
   *
   * **No lanza** por un token invalido, vencido o revocado: devuelve
   * `condominio: null` y un motivo legible. Un enlace vencido es informacion
   * util para quien lo recibio, no un error de red.
   */
  async obtenerPaginaInvitacion(rawToken: string): Promise<PaginaInvitacion> {
    const invalido = (motivo: string): PaginaInvitacion => ({
      condominio: null,
      invitacion: { estado: 'REVOCADA', motivo, unidadesLibres: [], expiracion: null },
    });

    if (!rawToken || rawToken.length < 32) {
      return invalido('Este enlace de invitación no es válido.');
    }

    const rows = await this.dataSource.query(
      `
      SELECT id_invitacion, id_condominio, estado, expiracion
      FROM invitaciones_condominio
      WHERE token_hash = $1
      LIMIT 1
      `,
      [this.hashear(rawToken)],
    );

    if (rows.length === 0) {
      return invalido('Este enlace de invitación no es válido.');
    }

    const fila = rows[0] as Record<string, unknown>;
    const idCondominio = Number(fila.id_condominio);

    const condominio = await this.leerCondominio(idCondominio);
    if (!condominio) {
      return invalido('Este enlace de invitación no es válido.');
    }

    const estado = String(fila.estado);
    if (estado !== 'ACTIVA') {
      return {
        condominio,
        invitacion: {
          estado: 'REVOCADA',
          motivo:
            'Este enlace de invitación fue desactivado. Pide uno nuevo al administrador.',
          unidadesLibres: [],
          expiracion: null,
        },
      };
    }

    const expiracion = new Date(String(fila.expiracion));
    if (expiracion.getTime() < Date.now()) {
      return {
        condominio,
        invitacion: {
          estado: 'EXPIRADA',
          motivo: 'Este enlace de invitación venció. Pide uno nuevo al administrador.',
          unidadesLibres: [],
          expiracion: expiracion.toISOString(),
        },
      };
    }

    // Un condominio suspendido o sin suscripción no puede recibir altas, pero su
    // página pública sigue funcionando: Stripe la revisa periódicamente.
    if (!(await this.condominioOperativo(idCondominio))) {
      return {
        condominio,
        invitacion: {
          estado: 'CONDOMINIO_NO_OPERATIVO',
          motivo:
            'El condominio no está recibiendo solicitudes en este momento. Contacta al administrador.',
          unidadesLibres: [],
          expiracion: expiracion.toISOString(),
        },
      };
    }

    const unidadesLibres = await this.unidadesDisponibles(idCondominio);

    const invitacion: ResolucionInvitacion =
      unidadesLibres.length === 0
        ? {
            estado: 'SIN_CUPO',
            motivo:
              'No hay unidades disponibles por el momento. Contacta al administrador para que libere un lugar.',
            unidadesLibres: [],
            expiracion: expiracion.toISOString(),
          }
        : {
            estado: 'DISPONIBLE',
            motivo: null,
            unidadesLibres,
            expiracion: expiracion.toISOString(),
          };

    return { condominio, invitacion };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Lee y normaliza los datos publicos. `null` si no existe o esta apagada. */
  private async leerCondominio(idCondominio: number): Promise<CondominioPublico | null> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id_condominio,
        nombre,
        descripcion_publica,
        correo_contacto,
        telefono_contacto,
        pagina_publica_activa,
        estado
      FROM condominios
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as Record<string, unknown>;
    if (row.pagina_publica_activa === false) {
      return null;
    }

    const descripcion = String(row.descripcion_publica ?? '').trim();

    return {
      idCondominio: Number(row.id_condominio),
      nombre: String(row.nombre ?? ''),
      descripcion: descripcion.length > 0 ? descripcion : DESCRIPCION_POR_DEFECTO,
      correoContacto: row.correo_contacto ? String(row.correo_contacto) : null,
      telefonoContacto: row.telefono_contacto ? String(row.telefono_contacto) : null,
      aceptaInvitaciones: String(row.estado) === 'ACTIVO',
    };
  }

  /**
   * Unidades que un solicitante podria reclamar.
   *
   * Se excluyen las que ya tienen ocupante activo y las que tienen una solicitud
   * viva: una unidad con solicitud en tramite esta reservada, aunque todavia no
   * aparezca como ocupada.
   */
  private async unidadesDisponibles(
    idCondominio: number,
  ): Promise<Array<{ idUnidad: number; claveUnidad: string; tipoUnidad: string }>> {
    const rows = await this.dataSource.query(
      `
      SELECT u.id_unidad, u.clave_unidad, u.tipo_unidad
      FROM unidades u
      WHERE u.id_condominio = $1
        AND u.estado = 'ACTIVA'
        AND NOT EXISTS (
          SELECT 1 FROM unidades_ocupantes uo
          WHERE uo.id_unidad = u.id_unidad
            AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
        )
        AND NOT EXISTS (
          SELECT 1 FROM solicitudes_alta_invitacion s
          WHERE s.id_unidad_propuesta = u.id_unidad
            AND s.estado IN ('PENDIENTE', 'VERIFICADA')
        )
      ORDER BY u.clave_unidad ASC
      `,
      [idCondominio],
    );

    if (!Array.isArray(rows)) {
      return [];
    }

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      idUnidad: Number(row.id_unidad),
      claveUnidad: String(row.clave_unidad ?? ''),
      tipoUnidad: String(row.tipo_unidad ?? 'OTRO'),
    }));
  }

  /**
   * `true` si el condominio puede recibir altas.
   *
   * Se reutiliza `CupoService.assertCondominioOperativo` para no duplicar las
   * reglas (suspendido, pendiente de pago, suscripcion vencida); aqui solo
   * interesa el booleano, no el error.
   */
  private async condominioOperativo(idCondominio: number): Promise<boolean> {
    try {
      await this.cupoService.assertCondominioOperativo(idCondominio);
      return true;
    } catch {
      return false;
    }
  }

  private hashear(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
