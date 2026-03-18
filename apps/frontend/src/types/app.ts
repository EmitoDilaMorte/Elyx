export type RoleKey = 'condomino' | 'administrador';

export type ViewKey =
  | 'inicio'
  | 'pagos'
  | 'avisos'
  | 'mantenimiento'
  | 'reportes'
  | 'validaciones'
  | 'finanzas';

export type CuotaStatus = 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';
export type PagoStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type MantenimientoStatus = 'NUEVO' | 'EN_PROCESO' | 'RESUELTO';
export type VoteChoice = 'favor' | 'contra';

export type IconName =
  | 'home'
  | 'payments'
  | 'megaphone'
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

export type DemoUser = {
  correo: string;
  password: string;
  role: RoleKey;
  nombre: string;
};

export type Cuota = {
  id: number;
  periodo: string;
  monto: number;
  fechaLimite: string;
  recargo: number;
  status: CuotaStatus;
};

export type Pago = {
  id: number;
  cuotaId: number;
  condominio: string;
  monto: number;
  fecha: string;
  status: PagoStatus;
};

export type Aviso = {
  id: number;
  titulo: string;
  mensaje: string;
  fecha: string;
};

export type VotacionActiva = {
  id: number;
  pregunta: string;
  aFavor: number;
  enContra: number;
  votosPorUsuario: Record<string, VoteChoice>;
};

export type MantenimientoReporte = {
  id: number;
  unidad: string;
  descripcion: string;
  fecha: string;
  estado: MantenimientoStatus;
};

export type Gasto = {
  id: number;
  concepto: string;
  categoria: string;
  monto: number;
  fecha: string;
};

export type ReporteFinanciero = {
  periodo: string;
  ingresos: number;
  gastos: number;
  adeudos: number;
};

export type AppData = {
  users: DemoUser[];
  cuotas: Cuota[];
  pagos: Pago[];
  avisos: Aviso[];
  votacionActiva: VotacionActiva;
  mantenimientos: MantenimientoReporte[];
  gastos: Gasto[];
  reportes: ReporteFinanciero[];
  nextIds: {
    pago: number;
    aviso: number;
    mantenimiento: number;
    gasto: number;
  };
};
