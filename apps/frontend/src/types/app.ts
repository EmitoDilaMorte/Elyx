export type RoleKey = 'condomino' | 'administrador' | 'superusuario';
export type MembershipState = 'ACTIVO' | 'INACTIVO';

export type ViewKey =
  | 'inicio'
  | 'pagos'
  | 'avisos'
  | 'votaciones'
  | 'mantenimiento'
  | 'reportes'
  | 'validaciones'
  | 'finanzas'
  | 'perfil'
  | 'solicitudes'
  | 'invitaciones'
  | 'suscripcion'
  | 'nuevo-condominio';

export type CuotaStatus = 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';
export type PagoStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type MantenimientoStatus = 'NUEVO' | 'EN_PROCESO' | 'RESUELTO' | 'CERRADO';
export type VoteChoice = 'favor' | 'contra';

export type IconName =
  | 'home'
  | 'payments'
  | 'megaphone'
  | 'vote'
  | 'tools'
  | 'report'
  | 'approve'
  | 'money'
  | 'users'
  | 'menu'
  | 'close'
  | 'download'
  | 'check'
  | 'link'
  | 'card';

export type NavItem = {
  key: ViewKey;
  label: string;
  icon: IconName;
};

export type Condominio = {
  idCondominio: number;
  nombre: string;
  direccion: string;
};

export type UserMembership = {
  idUsuarioCondominio: number;
  idCondominio: number;
  rol: RoleKey;
  estado: MembershipState;
};

export type DemoUser = {
  idUsuario: number;
  correo: string;
  password?: string;
  role: RoleKey;
  nombre: string;
  membresias: UserMembership[];
};

export type Cuota = {
  id: number;
  idCondominio: number;
  periodo: string;
  tipo: string;
  monto: number;
  fechaLimite: string;
  recargo: number;
  status: CuotaStatus;
};

export type Pago = {
  id: number;
  idCondominio: number;
  cuotaId: number;
  condominio: string;
  monto: number;
  fecha: string;
  status: PagoStatus;
  idUsuarioCondominioPaga?: number;
  idUsuarioCondominioAdmin?: number;
};

export type Aviso = {
  id: number;
  idCondominio: number;
  titulo: string;
  mensaje: string;
  fecha: string;
  idUsuarioCondominioAdmin: number;
};

export type VotacionTipo = 'GENERAL' | 'CAMBIO_CUOTA' | 'CAMBIO_ROL';

export type CambioRolVotacion = {
  idUsuarioCondominioObjetivo: number;
  nombreObjetivo: string;
  rolPropuesto: 'ADMINISTRADOR' | 'CONDOMINO';
  estadoPropuesta: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EJECUTADA';
  motivo: string | null;
  comentarioResolucion: string | null;
  ejecutable: boolean;
};

export type VotacionActiva = {
  id: number;
  idCondominio: number;
  pregunta: string;
  tipo?: VotacionTipo;
  cambioCuota?: {
    montoPropuesto: number;
    recargoPropuesto: number;
    diaLimitePropuesto: number;
    periodoAplicacion: string;
    estadoPropuesta: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EJECUTADA';
    motivo: string | null;
    ejecutable: boolean;
  } | null;
  cambioRol?: CambioRolVotacion | null;
  /**
   * Quorum congelado al crear la votacion. `null` en votaciones historicas,
   * que se resuelven por mayoria simple de los votos emitidos.
   */
  totalHabilitados?: number | null;
  votosRequeridos?: number | null;
  votosFaltantes?: number | null;
  /** Si la membresia actual ya voto. No revela el sentido del voto. */
  yaVoto?: boolean;
  aFavor: number;
  enContra: number;
  votosPorUsuario: Record<string, VoteChoice>;
};

export type MantenimientoReporte = {
  id: number;
  idCondominio: number;
  unidad: string;
  descripcion: string;
  fecha: string;
  estado: MantenimientoStatus;
  idUsuarioCondominioReporta?: number;
  idUsuarioCondominioAdmin?: number;
  claveUnidad?: string | null;
};

export type FotoMantenimiento = {
  idFoto: number;
  idReporte: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
  tipo: 'REPORTE' | 'RESOLUCION';
};

export type OcupanteInfo = {
  idUsuarioCondominio: number;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  tipoOcupacion: string;
};

export type UnidadConOcupante = {
  idUnidad: number;
  claveUnidad: string;
  tipoUnidad: string;
  tipoOcupacion: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE';
  fechaInicio: string;
  fechaFin: string | null;
  ocupante: OcupanteInfo | null;
};

export type Gasto = {
  id: number;
  idCondominio: number;
  concepto: string;
  categoria: string;
  monto: number;
  fecha: string;
};

export type ReporteFinanciero = {
  idCondominio: number;
  periodo: string;
  ingresos: number;
  gastos: number;
  /**
   * Comision de Stripe descontada del deposito del condominio. Se calcula
   * desde `cargos_cuota`, no se suma a `gastos` (evita doble conteo).
   */
  comisiones?: number;
  adeudos: number;
};

export type AppData = {
  condominios: Condominio[];
  users: DemoUser[];
  cuotas: Cuota[];
  pagos: Pago[];
  avisos: Aviso[];
  votacionesActivas: VotacionActiva[];
  mantenimientos: MantenimientoReporte[];
  gastos: Gasto[];
  reportes: ReporteFinanciero[];
  nextIds: {
    pago: number;
    aviso: number;
    votacion: number;
    mantenimiento: number;
    gasto: number;
  };
};
