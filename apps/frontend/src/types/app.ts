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
  | 'solicitudes';

export type CuotaStatus = 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';
export type PagoStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type MantenimientoStatus = 'NUEVO' | 'EN_PROCESO' | 'RESUELTO';
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
  | 'check';

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

export type VotacionActiva = {
  id: number;
  idCondominio: number;
  pregunta: string;
  tipo?: 'GENERAL' | 'CAMBIO_CUOTA';
  cambioCuota?: {
    montoPropuesto: number;
    recargoPropuesto: number;
    diaLimitePropuesto: number;
    periodoAplicacion: string;
    estadoPropuesta: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EJECUTADA';
    motivo: string | null;
    ejecutable: boolean;
  } | null;
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
  estado: string;
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
