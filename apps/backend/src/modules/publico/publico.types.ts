/** Tipos del modulo publico (pagina del condominio sin autenticacion). */

/**
 * Lo que se muestra en `/condominio/:id`.
 *
 * **Deliberadamente minimo.** Stripe exige en la web del negocio el nombre, la
 * descripcion de los servicios y datos de contacto de atencion al cliente; eso
 * es lo que se publica. NO se incluye:
 *  - la direccion exacta (calle y numero) del condominio,
 *  - ningun dato del administrador,
 *  - la lista de unidades,
 *  - importes de cuotas.
 *
 * La pagina necesita ser publica (Stripe la revisa sin credenciales), asi que
 * todo lo que se agregue aqui queda expuesto.
 */
export type CondominioPublico = {
  idCondominio: number;
  nombre: string;
  /** Descripcion de los servicios que cobra el condominio. */
  descripcion: string;
  correoContacto: string | null;
  telefonoContacto: string | null;
  /**
   * `true` mientras el condominio pueda recibir altas. La pagina usa esto para
   * mostrar el bloque de union; el detalle depende del token de invitacion.
   */
  aceptaInvitaciones: boolean;
};

/** Estado del enlace de invitacion visto desde la pagina publica. */
export type EstadoInvitacionPublica =
  | 'DISPONIBLE'
  | 'SIN_CUPO'
  | 'EXPIRADA'
  | 'REVOCADA'
  | 'CONDOMINIO_NO_OPERATIVO';

/**
 * Resultado de resolver un token de invitacion.
 *
 * `motivo` siempre viene redactado para mostrarse tal cual al usuario: el
 * backend es el unico que conoce las reglas (cupo, suscripcion, vencimiento) y
 * no tiene sentido duplicarlas en el frontend.
 */
export type ResolucionInvitacion = {
  estado: EstadoInvitacionPublica;
  /** Mensaje listo para mostrar. `null` cuando el estado es DISPONIBLE. */
  motivo: string | null;
  /**
   * Solo cuando el estado es DISPONIBLE. El frontend lo usa para pintar el
   * selector de unidad.
   */
  unidadesLibres: Array<{ idUnidad: number; claveUnidad: string; tipoUnidad: string }>;
  /** Cuando expira el enlace. Solo informativo. */
  expiracion: string | null;
};

/**
 * Respuesta de `GET /publico/invitaciones/:token`.
 *
 * El enlace de invitacion **no incluye el id del condominio** (seria un dato
 * interno en una URL publica), asi que el token se resuelve a la pagina
 * completa en una sola llamada. Cuando el token no sirve, `condominio` viene en
 * `null` y solo se puede mostrar el motivo.
 */
export type PaginaInvitacion = {
  condominio: CondominioPublico | null;
  invitacion: ResolucionInvitacion;
};
