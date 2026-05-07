import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { navAdministrador, navCondomino } from './constants/navigation';
import { statusLabel } from './constants/status';
import { ActiveCondominioProvider, useActiveCondominio } from './contexts/ActiveCondominioContext';
import { formatShortDate, seedData } from './lib/appData';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { SuperuserPage } from './pages/SuperuserPage';
import { backendApi, getApiHostUrl } from './services/backendApi.service';
import {
  closeVotacionInCondominio,
  getCobranzaProgreso,
  getCondominioScope,
  getVotacionesPendientes,
  voteInCondominio,
  type CondominioScope,
} from './services/multiCondominio.service';
import type {
  AppData,
  Aviso,
  Condominio,
  Cuota,
  CuotaStatus,
  DemoUser,
  FotoMantenimiento,
  Gasto,
  MembershipState,
  MantenimientoReporte,
  MantenimientoStatus,
  Pago,
  ReporteFinanciero,
  RoleKey,
  UnidadConOcupante,
  UserMembership,
  ViewKey,
  VoteChoice,
  VotacionActiva,
} from './types/app';

const ACTIVE_CONDOMINIO_STORAGE_PREFIX = 'elyx-active-condominio';

function getActiveCondominioStorageKey(correo: string) {
  return `${ACTIVE_CONDOMINIO_STORAGE_PREFIX}-${correo}`;
}

function getPersistedActiveCondominio(correo: string): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(getActiveCondominioStorageKey(correo));
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function persistActiveCondominio(correo: string, condominioId: number) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getActiveCondominioStorageKey(correo), String(condominioId));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function extractApiErrorMessage(error: unknown): string {
  const fallback = 'Error inesperado al conectar con backend';
  if (!(error instanceof Error)) {
    return fallback;
  }

  const marker = ': ';
  const markerIndex = error.message.indexOf(marker);
  if (markerIndex < 0) {
    return error.message;
  }

  const rawBody = error.message.slice(markerIndex + marker.length).trim();
  if (!rawBody) {
    return error.message;
  }

  try {
    const parsed = JSON.parse(rawBody) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join('. ');
    }
    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
    return rawBody;
  } catch {
    return rawBody;
  }
}

const EMPTY_SCOPE: CondominioScope = {
  cuotas: [],
  pagos: [],
  avisos: [],
  votacionesActivas: [],
  mantenimientos: [],
  gastos: [],
  reportes: [],
};

type EvidenciaPagoItem = {
  idEvidencia: number;
  idPago: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
};

type ConfigNotificacionesState = {
  diasAntes: number;
  diasDespues: number;
  usarEmail: boolean;
  usarInterna: boolean;
  activo: boolean;
};

type NotificacionItem = {
  idNotificacion: number;
  asunto: string;
  canal: string;
  estado: string;
  fechaProgramada: string;
};

type OnboardingFormState = {
  nombreCondominio: string;
  direccionCondominio: string;
  nombreAdmin: string;
  apellidoPaternoAdmin: string;
  correoAdmin: string;
  nombreCondomino: string;
  apellidoPaternoCondomino: string;
  correoCondomino: string;
};

type SuperOnboardingUserState = {
  nombre: string;
  apellidoPaterno: string;
  correo: string;
  claveUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
};

type SuperOnboardingUnitState = {
  claveUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
};

type SuperOnboardingState = {
  nombreCondominio: string;
  direccionCondominio: string;
  montoCuotaInicial: string;
  diaLimitePago: string;
  recargoFijoPorDia: string;
  periodoAplicacionInicial: string;
  fechaInicioCobro: string;
  admins: SuperOnboardingUserState[];
  condominos: SuperOnboardingUserState[];
  unidades: SuperOnboardingUnitState[];
};

type SuperOnboardingResult = {
  idCondominio: number;
  adminsCreados: Array<{ correo: string; passwordTemporal: string | null; reutilizado: boolean }>;
  condominosCreados: Array<{ correo: string; passwordTemporal: string | null; reutilizado: boolean }>;
  unidadesCreadas: number;
  ocupacionesCreadas: number;
  cuotasInicialesCreadas: number;
  cuotaInicial: {
    montoCuotaInicial: number;
    diaLimitePago: number;
    recargoFijoPorDia: number;
    periodoAplicacionInicial: string;
    fechaInicioCobro: string;
  };
  advertenciaCuotas?: string;
};

type SuperCondominioState = {
  idCondominio: number;
  nombre: string;
  direccion: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
  fechaAlta: string;
  totalAdmins: number;
  totalCondominos: number;
  totalUsuarios: number;
};

type PerfilState = {
  correo: string;
  passwordActual: string;
  passwordNueva: string;
};

type SolicitudFormState = {
  tipo: 'BAJA_CONDOMINO' | 'CAMBIO_UNIDAD';
  motivo: string;
  idUnidadDestino: string;
};

type AltaCondominoAdminFormState = {
  nombre: string;
  apellidoPaterno: string;
  correo: string;
  idUnidad: string;
  tipoOcupacion: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE';
};

type UnidadDisponibleState = {
  idUnidad: number;
  claveUnidad: string;
  tipoUnidad: string;
};

type SolicitudCambioState = {
  idSolicitud: number;
  idCondominio: number;
  idUsuarioCondominioSolicitante: number;
  idUsuarioCondominioObjetivo: number;
  tipo: string;
  estado: string;
  motivo: string;
  detalle: Record<string, unknown> | null;
  comentarioResolucion: string | null;
  fechaSolicitud: string;
  fechaResolucion: string | null;
  fechaEjecucion: string | null;
};

type CuotaCambioVotacionFormState = {
  montoPropuesto: string;
  recargoPropuesto: string;
  diaLimitePropuesto: string;
  motivo: string;
};

const DEFAULT_CONFIG_NOTIFICACIONES: ConfigNotificacionesState = {
  diasAntes: 3,
  diasDespues: 2,
  usarEmail: true,
  usarInterna: true,
  activo: true,
};

const DEFAULT_ONBOARDING_FORM: OnboardingFormState = {
  nombreCondominio: '',
  direccionCondominio: '',
  nombreAdmin: '',
  apellidoPaternoAdmin: '',
  correoAdmin: '',
  nombreCondomino: '',
  apellidoPaternoCondomino: '',
  correoCondomino: '',
};

const EMPTY_SUPER_USER: SuperOnboardingUserState = {
  nombre: '',
  apellidoPaterno: '',
  correo: '',
  claveUnidad: '',
  tipoUnidad: 'DEPARTAMENTO',
};

const EMPTY_SUPER_UNIDAD: SuperOnboardingUnitState = {
  claveUnidad: '',
  tipoUnidad: 'DEPARTAMENTO',
};

const DEFAULT_SUPER_ONBOARDING: SuperOnboardingState = {
  nombreCondominio: '',
  direccionCondominio: '',
  montoCuotaInicial: '0',
  diaLimitePago: '10',
  recargoFijoPorDia: '0',
  periodoAplicacionInicial: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  fechaInicioCobro: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
  admins: [{ ...EMPTY_SUPER_USER }],
  condominos: [{ ...EMPTY_SUPER_USER }],
  unidades: [],
};

const DEFAULT_PERFIL: PerfilState = {
  correo: '',
  passwordActual: '',
  passwordNueva: '',
};

const DEFAULT_SOLICITUD_FORM: SolicitudFormState = {
  tipo: 'BAJA_CONDOMINO',
  motivo: '',
  idUnidadDestino: '',
};

const DEFAULT_ALTA_CONDOMINO_FORM: AltaCondominoAdminFormState = {
  nombre: '',
  apellidoPaterno: '',
  correo: '',
  idUnidad: '',
  tipoOcupacion: 'PROPIETARIO',
};

const DEFAULT_CUOTA_CAMBIO_FORM: CuotaCambioVotacionFormState = {
  montoPropuesto: '',
  recargoPropuesto: '0',
  diaLimitePropuesto: '10',
  motivo: '',
};

function AppContent() {
  const { activeCondominioId, setActiveCondominioId } = useActiveCondominio();

  const [appData, setAppData] = useState<AppData>(() => seedData());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiereCambio, setRequiereCambio] = useState(false);
  const [role, setRole] = useState<RoleKey>('condomino');
  const [sessionUser, setSessionUser] = useState<DemoUser | null>(null);
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('inicio');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cambioFeedback, setCambioFeedback] = useState<string | null>(null);

  const [falla, setFalla] = useState('');
  const [fotosReporte, setFotosReporte] = useState<File[]>([]);
  const [avisoTitulo, setAvisoTitulo] = useState('');
  const [avisoMensaje, setAvisoMensaje] = useState('');
  const [gastoConcepto, setGastoConcepto] = useState('');
  const [gastoCategoria, setGastoCategoria] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [votacionPregunta, setVotacionPregunta] = useState('');
  const [periodosSeleccionados, setPeriodosSeleccionados] = useState<string[]>([]);
  const [evidenciasPorPago, setEvidenciasPorPago] = useState<Record<number, EvidenciaPagoItem[]>>({});
  const [fotosPorReporte, setFotosPorReporte] = useState<Record<number, FotoMantenimiento[]>>({});
  const [configNotificaciones, setConfigNotificaciones] =
    useState<ConfigNotificacionesState>(DEFAULT_CONFIG_NOTIFICACIONES);
  const [notificacionesRecientes, setNotificacionesRecientes] = useState<NotificacionItem[]>([]);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingFormState>(DEFAULT_ONBOARDING_FORM);
  const [superOnboarding, setSuperOnboarding] = useState<SuperOnboardingState>(DEFAULT_SUPER_ONBOARDING);
  const [superOnboardingResult, setSuperOnboardingResult] = useState<SuperOnboardingResult | null>(null);
  const [superSection, setSuperSection] = useState<'alta' | 'condominios'>('alta');
  const [superCondominios, setSuperCondominios] = useState<SuperCondominioState[]>([]);
  const [perfil, setPerfil] = useState<PerfilState>(DEFAULT_PERFIL);
  const [solicitudForm, setSolicitudForm] = useState<SolicitudFormState>(DEFAULT_SOLICITUD_FORM);
  const [altaCondominoForm, setAltaCondominoForm] =
    useState<AltaCondominoAdminFormState>(DEFAULT_ALTA_CONDOMINO_FORM);
  const [unidadesDisponibles, setUnidadesDisponibles] = useState<UnidadDisponibleState[]>([]);
  const [unidadesConOcupantes, setUnidadesConOcupantes] = useState<UnidadConOcupante[]>([]);
  const [solicitudesCambio, setSolicitudesCambio] = useState<SolicitudCambioState[]>([]);
  const [cuotaCambioForm, setCuotaCambioForm] = useState<CuotaCambioVotacionFormState>(DEFAULT_CUOTA_CAMBIO_FORM);
  const [votacionesCambioCuota, setVotacionesCambioCuota] = useState<VotacionActiva[]>([]);

  const navItems = role === 'condomino' ? navCondomino : navAdministrador;

  const memberships = useMemo(() => {
    if (!sessionUser) {
      return [] as UserMembership[];
    }
    return sessionUser.membresias.filter((item: UserMembership) => item.estado === 'ACTIVO');
  }, [sessionUser]);

  const condominiosDisponibles = useMemo(() => {
    const allowedIds = new Set(memberships.map((item: UserMembership) => item.idCondominio));
    return appData.condominios.filter((item: Condominio) => allowedIds.has(item.idCondominio));
  }, [appData.condominios, memberships]);

  const effectiveActiveCondominioId = useMemo(() => {
    if (condominiosDisponibles.length === 0) {
      return activeCondominioId;
    }

    if (
      activeCondominioId &&
      condominiosDisponibles.some((item: Condominio) => item.idCondominio === activeCondominioId)
    ) {
      return activeCondominioId;
    }

    return condominiosDisponibles[0].idCondominio;
  }, [activeCondominioId, condominiosDisponibles]);

  useEffect(() => {
    if (!effectiveActiveCondominioId) {
      return;
    }
    if (effectiveActiveCondominioId !== activeCondominioId) {
      setActiveCondominioId(effectiveActiveCondominioId);
    }
  }, [activeCondominioId, effectiveActiveCondominioId, setActiveCondominioId]);

  const activeMembership = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return undefined;
    }

    return memberships.find((item: UserMembership) => item.idCondominio === effectiveActiveCondominioId);
  }, [effectiveActiveCondominioId, memberships]);

  const condominioScope = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return EMPTY_SCOPE;
    }

    return getCondominioScope(appData, effectiveActiveCondominioId);
  }, [appData, effectiveActiveCondominioId]);

  const {
    cuotas: cuotasScoped,
    pagos: pagosScoped,
    avisos: avisosScoped,
    votacionesActivas: votacionesScoped,
    mantenimientos: mantenimientosScoped,
    gastos: gastosScoped,
    reportes: reportesScoped,
  } = condominioScope;

  const cuotasPendientes = useMemo(
    () => cuotasScoped.filter((cuota: Cuota) => cuota.status !== 'PAGADA'),
    [cuotasScoped],
  );

  const pagosPendientesAdmin = useMemo(
    () => pagosScoped.filter((pago: Pago) => pago.status === 'PENDIENTE'),
    [pagosScoped],
  );

  const cobranzaResumen = useMemo(() => getCobranzaProgreso(cuotasScoped), [cuotasScoped]);
  const cuotasPagadas = cobranzaResumen.pagadas;
  const cobranzaProgreso = cobranzaResumen.porcentaje;

  const votacionesPendientesUsuario = useMemo(() => {
    if (!sessionUser) {
      return 0;
    }

    return getVotacionesPendientes(votacionesScoped, sessionUser.correo);
  }, [sessionUser, votacionesScoped]);

  const gastosRecientes = useMemo(() => gastosScoped.slice(0, 6), [gastosScoped]);

  const mantenimientosAbiertos = useMemo(
    () => mantenimientosScoped.filter((item: MantenimientoReporte) => item.estado !== 'RESUELTO' && item.estado !== 'CERRADO').length,
    [mantenimientosScoped],
  );

  const saldoActual = useMemo(() => {
    return cuotasPendientes.reduce((acc: number, cuota: Cuota) => acc + cuota.monto + cuota.recargo, 0);
  }, [cuotasPendientes]);

  const balanceMensual = useMemo(() => {
    if (reportesScoped.length > 0) {
      const ultimoReporte = reportesScoped[0];
      return ultimoReporte.ingresos - ultimoReporte.gastos;
    }

    const totalGastos = gastosScoped.reduce((sum: number, gasto: Gasto) => sum + gasto.monto, 0);
    return -totalGastos;
  }, [gastosScoped, reportesScoped]);

  const periodosDisponibles = useMemo(
    () => Array.from(new Set(reportesScoped.map((item: ReporteFinanciero) => item.periodo))),
    [reportesScoped],
  );

  const reportesFiltrados = useMemo(() => {
    if (periodosSeleccionados.length === 0) {
      return reportesScoped;
    }

    const periodosSet = new Set(periodosSeleccionados);
    return reportesScoped.filter((item: ReporteFinanciero) => periodosSet.has(item.periodo));
  }, [periodosSeleccionados, reportesScoped]);

  useEffect(() => {
    if (periodosSeleccionados.length === 0) {
      return;
    }

    setPeriodosSeleccionados((prev) => prev.filter((periodo) => periodosDisponibles.includes(periodo)));
  }, [periodosDisponibles, periodosSeleccionados.length]);

  const panelReminders = useMemo(() => {
    const reminders: string[] = [];

    if (role === 'condomino') {
      if (cuotasPendientes.length > 0) {
        reminders.push(`Tienes ${cuotasPendientes.length} cuota(s) pendiente(s) por pagar.`);
      }
      if (votacionesPendientesUsuario > 0) {
        reminders.push(`Hay ${votacionesPendientesUsuario} votacion(es) pendiente(s) por responder.`);
      }
      if (mantenimientosAbiertos > 0) {
        reminders.push(`Hay ${mantenimientosAbiertos} reporte(s) de mantenimiento abierto(s) en seguimiento.`);
      }
    } else {
      if (pagosPendientesAdmin.length > 0) {
        reminders.push(`Hay ${pagosPendientesAdmin.length} pago(s) pendiente(s) por validar.`);
      }
      if (votacionesScoped.length === 0) {
        reminders.push('No hay votaciones activas en este condominio.');
      }
      if (mantenimientosAbiertos > 0) {
        reminders.push(`Hay ${mantenimientosAbiertos} reporte(s) de mantenimiento pendiente(s) de cierre.`);
      }
    }

    if (reminders.length === 0) {
      reminders.push('Todo al corriente por ahora.');
    }

    return reminders.slice(0, 3);
  }, [
    cuotasPendientes.length,
    mantenimientosAbiertos,
    pagosPendientesAdmin.length,
    role,
    votacionesPendientesUsuario,
    votacionesScoped.length,
  ]);

  const scopedData = useMemo(
    () => ({
      ...appData,
      cuotas: cuotasScoped,
      pagos: pagosScoped,
      avisos: avisosScoped,
      votacionesActivas: votacionesScoped,
      mantenimientos: mantenimientosScoped,
      gastos: gastosScoped,
      reportes: reportesScoped,
    }),
    [
      appData,
      avisosScoped,
      cuotasScoped,
      gastosScoped,
      mantenimientosScoped,
      pagosScoped,
      reportesScoped,
      votacionesScoped,
    ],
  );

  const runAction = (loading: string, success: string) => {
    setLoadingLabel(loading);
    window.setTimeout(() => {
      setLoadingLabel(null);
      setFeedback(success);
      window.setTimeout(() => setFeedback(null), 2200);
    }, 900);
  };

  const patchAppData = (updater: (prev: AppData) => AppData) => {
    setAppData((prev: AppData) => updater(prev));
  };

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    let isCancelled = false;

    const syncScopeFromBackend = async () => {
      try {
        const [cuotasApi, avisosApi, votacionesApi, pagosApi, mantenimientosApi, gastosApi, reportesApi, evidenciasApi, fotosMantenimientoApi] =
          await Promise.all([
          backendApi.listCuotas(effectiveActiveCondominioId),
          backendApi.listAvisos(effectiveActiveCondominioId),
          backendApi.listVotaciones(effectiveActiveCondominioId),
          backendApi.listPagos(effectiveActiveCondominioId),
          backendApi.listReportesMantenimiento(effectiveActiveCondominioId),
          backendApi.listGastos(effectiveActiveCondominioId),
          backendApi.listReportesFinancieros(effectiveActiveCondominioId),
          backendApi.listEvidenciasPago({ idCondominio: effectiveActiveCondominioId }),
          backendApi.listFotosMantenimiento({ idCondominio: effectiveActiveCondominioId }),
        ]);

        if (isCancelled) {
          return;
        }

        const evidenciasAgrupadas = evidenciasApi.reduce<Record<number, EvidenciaPagoItem[]>>((acc, item) => {
          if (!acc[item.idPago]) {
            acc[item.idPago] = [];
          }
          acc[item.idPago].push(item);
          return acc;
        }, {});

        setEvidenciasPorPago((prev) => {
          const next: Record<number, EvidenciaPagoItem[]> = { ...prev };

          Object.keys(next).forEach((pagoId) => {
            const pagoIdNum = Number(pagoId);
            const pago = pagosApi.find((p) => p.id === pagoIdNum);
            if (!pago || pago.idCondominio === effectiveActiveCondominioId) {
              delete next[pagoIdNum];
            }
          });

          Object.entries(evidenciasAgrupadas).forEach(([pagoId, evidencias]) => {
            next[Number(pagoId)] = evidencias;
          });

          return next;
        });

        const fotosAgrupadas = fotosMantenimientoApi.reduce<Record<number, FotoMantenimiento[]>>((acc, item) => {
          if (!acc[item.idReporte]) {
            acc[item.idReporte] = [];
          }
          acc[item.idReporte].push(item);
          return acc;
        }, {});

        setFotosPorReporte((prev) => {
          const next: Record<number, FotoMantenimiento[]> = { ...prev };

          Object.keys(next).forEach((reporteId) => {
            const reporteIdNum = Number(reporteId);
            const reporte = mantenimientosApi.find((r) => r.id === reporteIdNum);
            if (!reporte || reporte.idCondominio === effectiveActiveCondominioId) {
              delete next[reporteIdNum];
            }
          });

          Object.entries(fotosAgrupadas).forEach(([reporteId, fotos]) => {
            next[Number(reporteId)] = fotos;
          });

          return next;
        });

        setAppData((prev: AppData) => {
          const votosPrevios = new Map(
            prev.votacionesActivas
              .filter((item: VotacionActiva) => item.idCondominio === effectiveActiveCondominioId)
              .map((item: VotacionActiva) => [item.id, item.votosPorUsuario]),
          );

          const votacionesMerge = votacionesApi.map((item) => ({
            ...item,
            votosPorUsuario: votosPrevios.get(item.id) ?? {},
          }));

          const next: AppData = {
            ...prev,
            cuotas: [...prev.cuotas.filter((item: Cuota) => item.idCondominio !== effectiveActiveCondominioId), ...cuotasApi],
            avisos: [...prev.avisos.filter((item: Aviso) => item.idCondominio !== effectiveActiveCondominioId), ...avisosApi],
            pagos: [...prev.pagos.filter((item: Pago) => item.idCondominio !== effectiveActiveCondominioId), ...pagosApi],
            votacionesActivas: [
              ...prev.votacionesActivas.filter(
                (item: VotacionActiva) => item.idCondominio !== effectiveActiveCondominioId,
              ),
              ...votacionesMerge,
            ],
            mantenimientos: [
              ...prev.mantenimientos.filter((item: MantenimientoReporte) => item.idCondominio !== effectiveActiveCondominioId),
              ...mantenimientosApi,
            ],
            gastos: [...prev.gastos.filter((item: Gasto) => item.idCondominio !== effectiveActiveCondominioId), ...gastosApi],
            reportes: [
              ...prev.reportes.filter((item: ReporteFinanciero) => item.idCondominio !== effectiveActiveCondominioId),
              ...reportesApi,
            ],
          };
          return next;
        });
      } catch (error) {
        console.error('No se pudo sincronizar con backend para el condominio activo:', error);
      }
    };

    void syncScopeFromBackend();

    const pollInterval = window.setInterval(() => {
      void syncScopeFromBackend();
    }, 10000);

    return () => {
      isCancelled = true;
      window.clearInterval(pollInterval);
    };
  }, [effectiveActiveCondominioId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    let cancelled = false;
    const syncConfigYNotificaciones = async () => {
      try {
        const [config, notificaciones] = await Promise.all([
          backendApi.getConfigNotificaciones({
            idCondominio: effectiveActiveCondominioId,
            idUsuarioCondominio: activeMembership.idUsuarioCondominio,
          }),
          backendApi.listNotificaciones({
            idCondominio: effectiveActiveCondominioId,
            idUsuarioCondominio: activeMembership.idUsuarioCondominio,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setConfigNotificaciones({
          diasAntes: config.diasAntes,
          diasDespues: config.diasDespues,
          usarEmail: config.usarEmail,
          usarInterna: config.usarInterna,
          activo: config.activo,
        });

        setNotificacionesRecientes(
          notificaciones.slice(0, 6).map((item) => ({
            idNotificacion: item.idNotificacion,
            asunto: item.asunto,
            canal: item.canal,
            estado: item.estado,
            fechaProgramada: item.fechaProgramada,
          })),
        );
      } catch (error) {
        const message = extractApiErrorMessage(error).toLowerCase();
        if (message.includes('no se encontro configuracion')) {
          setConfigNotificaciones(DEFAULT_CONFIG_NOTIFICACIONES);
          return;
        }
        console.error('No se pudo sincronizar preferencias/notificaciones:', error);
      }
    };

    void syncConfigYNotificaciones();

    return () => {
      cancelled = true;
    };
  }, [activeMembership, effectiveActiveCondominioId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    const socket = io(`${getApiHostUrl()}/ws/evidencias`, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('joinCondominio', { idCondominio: effectiveActiveCondominioId });
    });

    socket.on('evidenciaPagoChanged', async () => {
      try {
        const evidenciasApi = await backendApi.listEvidenciasPago({ idCondominio: effectiveActiveCondominioId });
        const evidenciasAgrupadas = evidenciasApi.reduce<Record<number, EvidenciaPagoItem[]>>((acc, item) => {
          if (!acc[item.idPago]) {
            acc[item.idPago] = [];
          }
          acc[item.idPago].push(item);
          return acc;
        }, {});

        setEvidenciasPorPago((prev) => ({ ...prev, ...evidenciasAgrupadas }));
      } catch (error) {
        console.error('No se pudo refrescar evidencias por websocket:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [effectiveActiveCondominioId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    const socket = io(`${getApiHostUrl()}/ws/pagos`, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('joinCondominio', { idCondominio: effectiveActiveCondominioId });
    });

    socket.on('pagoChanged', async () => {
      try {
        const [pagosApi, cuotasApi] = await Promise.all([
          backendApi.listPagos(effectiveActiveCondominioId),
          backendApi.listCuotas(effectiveActiveCondominioId),
        ]);

        setAppData((prev: AppData) => ({
          ...prev,
          pagos: [...prev.pagos.filter((item: Pago) => item.idCondominio !== effectiveActiveCondominioId), ...pagosApi],
          cuotas: [...prev.cuotas.filter((item: Cuota) => item.idCondominio !== effectiveActiveCondominioId), ...cuotasApi],
        }));
      } catch (error) {
        console.error('No se pudo refrescar pagos por websocket:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [effectiveActiveCondominioId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    const socket = io(`${getApiHostUrl()}/ws/mantenimientos`, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('joinCondominio', { idCondominio: effectiveActiveCondominioId });
    });

    socket.on('mantenimientoChanged', async () => {
      try {
        const mantenimientosApi = await backendApi.listReportesMantenimiento(effectiveActiveCondominioId);
        setAppData((prev: AppData) => ({
          ...prev,
          mantenimientos: [
            ...prev.mantenimientos.filter((item: MantenimientoReporte) => item.idCondominio !== effectiveActiveCondominioId),
            ...mantenimientosApi,
          ],
        }));
      } catch (error) {
        console.error('No se pudo refrescar mantenimientos por websocket:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [effectiveActiveCondominioId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    const socket = io(`${getApiHostUrl()}/ws/avisos`, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('joinCondominio', { idCondominio: effectiveActiveCondominioId });
    });

    socket.on('avisoChanged', async () => {
      try {
        const avisosApi = await backendApi.listAvisos(effectiveActiveCondominioId);
        setAppData((prev: AppData) => ({
          ...prev,
          avisos: [...prev.avisos.filter((item: Aviso) => item.idCondominio !== effectiveActiveCondominioId), ...avisosApi],
        }));
      } catch (error) {
        console.error('No se pudo refrescar avisos por websocket:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [effectiveActiveCondominioId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    const socket = io(`${getApiHostUrl()}/ws/votaciones`, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('joinCondominio', { idCondominio: effectiveActiveCondominioId });
    });

    socket.on('votacionChanged', async () => {
      try {
        const votacionesApi = await backendApi.listVotaciones(effectiveActiveCondominioId);
        setAppData((prev: AppData) => {
          const votosPrevios = new Map(
            prev.votacionesActivas
              .filter((item: VotacionActiva) => item.idCondominio === effectiveActiveCondominioId)
              .map((item: VotacionActiva) => [item.id, item.votosPorUsuario]),
          );

          const votacionesMerge = votacionesApi.map((item) => ({
            ...item,
            votosPorUsuario: votosPrevios.get(item.id) ?? {},
          }));

          return {
            ...prev,
            votacionesActivas: [
              ...prev.votacionesActivas.filter((item: VotacionActiva) => item.idCondominio !== effectiveActiveCondominioId),
              ...votacionesMerge,
            ],
          };
        });

        if (role === 'administrador') {
          const especiales = await backendApi.listCambiosCuota(effectiveActiveCondominioId);
          setVotacionesCambioCuota(especiales);
        }
      } catch (error) {
        console.error('No se pudo sincronizar votaciones por websocket:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [effectiveActiveCondominioId, isAuthenticated, role]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const socket = io(`${getApiHostUrl()}/ws/notificaciones`, {
      transports: ['websocket'],
    });

    const refreshNotificaciones = async () => {
      try {
        const notificaciones = await backendApi.listNotificaciones({
          idCondominio: effectiveActiveCondominioId,
          idUsuarioCondominio: activeMembership.idUsuarioCondominio,
        });
        setNotificacionesRecientes(
          notificaciones.slice(0, 6).map((item) => ({
            idNotificacion: item.idNotificacion,
            asunto: item.asunto,
            canal: item.canal,
            estado: item.estado,
            fechaProgramada: item.fechaProgramada,
          })),
        );
      } catch (error) {
        console.error('No se pudo refrescar notificaciones por websocket:', error);
      }
    };

    socket.on('connect', () => {
      socket.emit('joinCondominio', { idCondominio: effectiveActiveCondominioId });
      socket.emit('joinUsuarioCondominio', {
        idUsuarioCondominio: activeMembership.idUsuarioCondominio,
      });
    });

    socket.on('notificacionChanged', () => {
      void refreshNotificaciones();
      void cargarSolicitudesCambio();
    });

    socket.on('configNotificacionesChanged', async () => {
      try {
        const config = await backendApi.getConfigNotificaciones({
          idCondominio: effectiveActiveCondominioId,
          idUsuarioCondominio: activeMembership.idUsuarioCondominio,
        });
        setConfigNotificaciones({
          diasAntes: config.diasAntes,
          diasDespues: config.diasDespues,
          usarEmail: config.usarEmail,
          usarInterna: config.usarInterna,
          activo: config.activo,
        });
      } catch (error) {
        console.error('No se pudo refrescar configuracion por websocket:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeMembership, effectiveActiveCondominioId, isAuthenticated]);

  const closeMobileMenu = () => setMenuOpen(false);

  const handleCondominioChange = (condominioId: number) => {
    if (!sessionUser) {
      return;
    }

    setActiveCondominioId(condominioId);
    persistActiveCondominio(sessionUser.correo, condominioId);

    const condominioName = appData.condominios.find((item: Condominio) => item.idCondominio === condominioId)?.nombre;
    runAction('Cambiando condominio...', `Mostrando ${condominioName ?? 'condominio seleccionado'}`);
  };

  const handleLogin = async () => {
    const correoNormalizado = correo.trim().toLowerCase();

    try {
      setLoadingLabel('Validando credenciales...');
      const response = await backendApi.login(correoNormalizado, password);
      const matchedUser: DemoUser = {
        idUsuario: response.user.idUsuario,
        correo: response.user.correo,
        nombre: response.user.nombre,
        role: response.user.role,
        membresias: response.user.membresias.map((item) => ({
          idUsuarioCondominio: item.idUsuarioCondominio,
          idCondominio: item.idCondominio,
          rol: item.rol === 'ADMINISTRADOR' ? 'administrador' : 'condomino',
          estado: item.estado === 'ACTIVO' ? ('ACTIVO' as MembershipState) : ('INACTIVO' as MembershipState),
        })),
      };

      const membresiasActivas = matchedUser.membresias.filter((item: UserMembership) => item.estado === 'ACTIVO');
      if (membresiasActivas.length === 0 && matchedUser.role !== 'superusuario') {
        setLoginError('Tu usuario no tiene condominios activos asignados.');
        setLoadingLabel(null);
        return;
      }

      setLoginError(null);
      setLoadingLabel('Iniciando sesion...');

      const persistedCondominio = getPersistedActiveCondominio(matchedUser.correo);
      const condominioValido = persistedCondominio
        ? membresiasActivas.find((item: UserMembership) => item.idCondominio === persistedCondominio)
        : undefined;

      const selectedCondominioId =
        condominioValido?.idCondominio ??
        membresiasActivas[0]?.idCondominio ??
        appData.condominios[0]?.idCondominio ??
        0;

      window.setTimeout(() => {
        setRole(matchedUser.role);
        setSessionUser(matchedUser);
        setPerfil({
          correo: matchedUser.correo,
          passwordActual: '',
          passwordNueva: '',
        });
        if (response.user.requiereCambioPassword) {
          setRequiereCambio(true);
          setIsAuthenticated(true);
          setLoadingLabel(null);
          return;
        }
        if (selectedCondominioId > 0) {
          setActiveCondominioId(selectedCondominioId);
          persistActiveCondominio(matchedUser.correo, selectedCondominioId);
        }
        setActiveView('inicio');
        setIsAuthenticated(true);
        setMenuOpen(false);
        setCuotaCambioForm(DEFAULT_CUOTA_CAMBIO_FORM);
        setVotacionesCambioCuota([]);
        setLoadingLabel(null);
        setFeedback('Bienvenido a Elyx');
        window.setTimeout(() => setFeedback(null), 2200);
      }, 380);
    } catch (error) {
      console.error(error);
      backendApi.setAccessToken(null);
      setLoadingLabel(null);
      setLoginError('Credenciales no validas. Revisa correo y contrasena.');
    }
  };

  const cerrarSesion = () => {
    backendApi.setAccessToken(null);
    setIsAuthenticated(false);
    setSessionUser(null);
    setPerfil(DEFAULT_PERFIL);
    setSolicitudForm(DEFAULT_SOLICITUD_FORM);
    setAltaCondominoForm(DEFAULT_ALTA_CONDOMINO_FORM);
    setUnidadesDisponibles([]);
    setSolicitudesCambio([]);
    setCuotaCambioForm(DEFAULT_CUOTA_CAMBIO_FORM);
    setVotacionesCambioCuota([]);
    setCorreo('');
    setPassword('');
    setLoginError(null);
    setRequiereCambio(false);
    setCambioFeedback(null);
  };

  const registrarPagoCondomino = async (cuotaId: number) => {
    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const pago = await backendApi.capturarPago({
        idCondominio: effectiveActiveCondominioId,
        idCuota: cuotaId,
        idUsuarioCondominioPaga: activeMembership.idUsuarioCondominio,
      });

      patchAppData((prev) => ({
        ...prev,
        pagos: [pago, ...prev.pagos],
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === cuotaId && item.idCondominio === effectiveActiveCondominioId
            ? { ...item, status: 'EN_VALIDACION' as CuotaStatus }
            : item,
        ),
      }));

      runAction('Registrando pago...', 'Pago enviado para validacion');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo registrar el pago en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const subirComprobante = async (cuotaId: number, file: File) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const pago = pagosScoped.find((item: Pago) => item.cuotaId === cuotaId && item.status !== 'RECHAZADO');
    if (!pago) {
      setFeedback('Primero registra el pago para poder subir comprobante');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      if (file.size > 5 * 1024 * 1024) {
        setFeedback('El comprobante supera el limite de 5 MB');
        window.setTimeout(() => setFeedback(null), 2200);
        return;
      }

      const evidencia = await backendApi.createEvidenciaPago({
        idCondominio: effectiveActiveCondominioId,
        idPago: pago.id,
        nombreArchivo: file.name,
        archivo: file,
      });

      setEvidenciasPorPago((prev) => ({
        ...prev,
        [pago.id]: [evidencia, ...(prev[pago.id] ?? [])],
      }));

      runAction('Subiendo comprobante...', 'Comprobante cargado correctamente');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo subir el comprobante al backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const eliminarEvidenciaPago = async (idEvidencia: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    try {
      await backendApi.deleteEvidenciaPago({
        idCondominio: effectiveActiveCondominioId,
        idEvidencia,
      });

      setEvidenciasPorPago((prev) => {
        const next: Record<number, EvidenciaPagoItem[]> = {};
        for (const [pagoId, evidencias] of Object.entries(prev)) {
          const filtradas = evidencias.filter((e) => e.idEvidencia !== idEvidencia);
          if (filtradas.length > 0) {
            next[Number(pagoId)] = filtradas;
          }
        }
        return next;
      });

      runAction('Eliminando comprobante...', 'Comprobante eliminado correctamente');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const abrirRecibo = async (recibo: { folio: string; urlPdf: string; idPago: number }) => {
    try {
      const parsedUrl = new URL(recibo.urlPdf);
      const isPrivateHost = parsedUrl.hostname.endsWith('.elyx.local');
      if (!isPrivateHost) {
        window.open(recibo.urlPdf, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch {
      // If URL parsing fails, fallback to local PDF below.
    }

    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 420]);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('Recibo Elyx', {
      x: 40,
      y: 370,
      size: 20,
      font: bold,
      color: rgb(0.06, 0.36, 0.35),
    });

    const rows = [
      `Folio: ${recibo.folio}`,
      `Pago: #${recibo.idPago}`,
      `Condominio: #${effectiveActiveCondominioId ?? '-'}`,
      `Generado: ${new Date().toLocaleString('es-MX')}`,
      'Nota: URL privada no disponible desde navegador, se entrega copia local.',
    ];

    let y = 330;
    for (const row of rows) {
      page.drawText(row, { x: 40, y, size: 11, font: regular });
      y -= 30;
    }

    const bytes = await doc.save();
    const arr = new Uint8Array(bytes.length);
    arr.set(bytes);
    const blob = new Blob([arr], { type: 'application/pdf' });
    downloadBlob(blob, `${recibo.folio}.pdf`);
  };

  const descargarReciboCuota = async (cuotaId: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const pago = pagosScoped.find((item: Pago) => item.cuotaId === cuotaId && item.status === 'APROBADO');
    if (!pago) {
      setFeedback('Necesitas un pago aprobado para descargar el recibo');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const recibo = await backendApi.generarRecibo({
        idCondominio: effectiveActiveCondominioId,
        idPago: pago.id,
      });

      await abrirRecibo(recibo);
      runAction('Generando recibo...', 'Recibo PDF generado y listo para descarga');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const generarReciboPago = async (idPago: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    try {
      const recibo = await backendApi.generarRecibo({
        idCondominio: effectiveActiveCondominioId,
        idPago,
      });

      await abrirRecibo(recibo);
      runAction('Generando recibo...', 'Recibo generado y enviado');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const aprobarPago = async (idPago: number) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const pagoActualizado = await backendApi.aprobarPago({
        idCondominio: effectiveActiveCondominioId,
        idPago,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
      });

      patchAppData((prev) => ({
        ...prev,
        pagos: prev.pagos.map((item: Pago) => (item.id === idPago ? pagoActualizado : item)),
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === pagoActualizado.cuotaId ? { ...item, status: 'PAGADA' as CuotaStatus, recargo: 0 } : item,
        ),
      }));

      runAction('Validando pago...', 'Pago validado con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo validar el pago en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const rechazarPago = async (idPago: number) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const pagoActualizado = await backendApi.rechazarPago({
        idCondominio: effectiveActiveCondominioId,
        idPago,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        motivoRechazo: 'No cumple validacion documental',
      });

      patchAppData((prev) => ({
        ...prev,
        pagos: prev.pagos.map((item: Pago) => (item.id === idPago ? pagoActualizado : item)),
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === pagoActualizado.cuotaId ? { ...item, status: 'PENDIENTE' as CuotaStatus } : item,
        ),
      }));

      runAction('Actualizando estado...', 'Pago rechazado y notificado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo rechazar el pago en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const publicarAviso = async () => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const titulo = avisoTitulo.trim();
    const mensaje = avisoMensaje.trim();

    if (!titulo || !mensaje) {
      setFeedback('Completa titulo y descripcion del aviso');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (titulo.length < 5 || mensaje.length < 10) {
      setFeedback('El titulo debe tener minimo 5 caracteres y el aviso al menos 10');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const nuevoAviso = await backendApi.createAviso({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        titulo,
        contenido: mensaje,
      });

      patchAppData((prev) => ({
        ...prev,
        avisos: [...prev.avisos, nuevoAviso],
      }));

      setAvisoTitulo('');
      setAvisoMensaje('');
      runAction('Publicando aviso...', 'Aviso publicado con exito');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const votar = async (votacionId: number, choice: VoteChoice) => {
    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const resumen = await backendApi.votar({
        idCondominio: effectiveActiveCondominioId,
        idVotacion: votacionId,
        idUsuarioCondominio: activeMembership.idUsuarioCondominio,
        choice,
      });

      patchAppData((prev) =>
        voteInCondominio(
          {
            ...prev,
            votacionesActivas: prev.votacionesActivas.map((item) =>
              item.id === votacionId
                ? {
                    ...item,
                    aFavor: resumen.aFavor,
                    enContra: resumen.enContra,
                  }
                : item,
            ),
          },
          {
            idCondominio: effectiveActiveCondominioId,
            idVotacion: votacionId,
            correoUsuario: sessionUser.correo,
            choice,
          },
        ),
      );

      runAction('Registrando voto...', 'Voto registrado con exito');
    } catch (error) {
      console.error(error);
      const errorMessage = extractApiErrorMessage(error);
      if (errorMessage.toLowerCase().includes('ya emitio su voto')) {
        patchAppData((prev) =>
          voteInCondominio(prev, {
            idCondominio: effectiveActiveCondominioId,
            idVotacion: votacionId,
            correoUsuario: sessionUser.correo,
            choice,
          }),
        );
        setFeedback('Tu voto ya estaba registrado');
        window.setTimeout(() => setFeedback(null), 2200);
        return;
      }
      setFeedback(errorMessage);
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const crearVotacion = async () => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const pregunta = votacionPregunta.trim();
    if (pregunta.length < 10) {
      setFeedback('La pregunta de votacion debe tener al menos 10 caracteres');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const votacion = await backendApi.createVotacion({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        pregunta,
      });

      patchAppData((prev) => ({
        ...prev,
        votacionesActivas: [votacion, ...prev.votacionesActivas],
      }));

      setVotacionPregunta('');
      runAction('Publicando votacion...', 'Votacion creada con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo crear la votacion en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const crearVotacionCambioCuota = async () => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const montoPropuesto = Number(cuotaCambioForm.montoPropuesto);
    const recargoPropuesto = Number(cuotaCambioForm.recargoPropuesto || '0');
    const diaLimitePropuesto = Number(cuotaCambioForm.diaLimitePropuesto || '10');
    const motivo = cuotaCambioForm.motivo.trim();

    if (Number.isNaN(montoPropuesto) || montoPropuesto <= 0) {
      setFeedback('Ingresa un monto propuesto valido para la cuota.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (Number.isNaN(recargoPropuesto) || recargoPropuesto < 0) {
      setFeedback('Ingresa un recargo valido (0 o mayor).');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (!Number.isInteger(diaLimitePropuesto) || diaLimitePropuesto < 1 || diaLimitePropuesto > 28) {
      setFeedback('El dia limite debe ser un entero entre 1 y 28.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const votacion = await backendApi.createVotacionCambioCuota({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        montoPropuesto,
        recargoPropuesto,
        diaLimitePropuesto,
        motivo: motivo || undefined,
      });

      patchAppData((prev) => ({
        ...prev,
        votacionesActivas: [votacion, ...prev.votacionesActivas],
      }));

      setCuotaCambioForm(DEFAULT_CUOTA_CAMBIO_FORM);
      await cargarVotacionesCambioCuota();
      runAction('Publicando propuesta...', 'Votacion especial de cambio de cuota publicada');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cerrarVotacion = async (votacionId: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    try {
      const cerrada = await backendApi.cerrarVotacion({
        idCondominio: effectiveActiveCondominioId,
        idVotacion: votacionId,
      });

      patchAppData((prev) =>
        closeVotacionInCondominio(prev, {
          idCondominio: effectiveActiveCondominioId,
          idVotacion: votacionId,
        }),
      );

      if (cerrada.tipo === 'CAMBIO_CUOTA' && role === 'administrador') {
        await cargarVotacionesCambioCuota();
      }

      runAction('Cerrando votacion...', 'Votacion cerrada y archivada');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo cerrar la votacion en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const ejecutarCambioCuota = async (idVotacion: number) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      await backendApi.ejecutarCambioCuota({
        idCondominio: effectiveActiveCondominioId,
        idVotacion,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
      });

      const [cuotasApi, votacionesEspeciales] = await Promise.all([
        backendApi.listCuotas(effectiveActiveCondominioId),
        backendApi.listCambiosCuota(effectiveActiveCondominioId),
      ]);

      setVotacionesCambioCuota(votacionesEspeciales);
      patchAppData((prev) => ({
        ...prev,
        cuotas: [...prev.cuotas.filter((item: Cuota) => item.idCondominio !== effectiveActiveCondominioId), ...cuotasApi],
      }));

      runAction('Ejecutando cambio...', 'Cambio de cuota ejecutado para el siguiente periodo');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const enviarReporteMantenimiento = async (fotos?: File[]) => {
    const fotosAElegir = fotos ?? fotosReporte;

    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const descripcion = falla.trim();
    if (!descripcion) {
      return;
    }

    try {
      const reporte = await backendApi.createReporteMantenimiento({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioReporta: activeMembership.idUsuarioCondominio,
        unidad: sessionUser.nombre,
        descripcion,
      });

      patchAppData((prev) => ({
        ...prev,
        mantenimientos: [reporte, ...prev.mantenimientos],
      }));

      if (fotosAElegir.length > 0) {
        await subirFotoMantenimiento(reporte.id, fotosAElegir, 'REPORTE');
      }

      setFalla('');
      setFotosReporte([]);
      runAction('Enviando reporte...', 'Reporte de mantenimiento enviado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo enviar el reporte al backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const descargarReporteExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = reportesFiltrados.map((item: ReporteFinanciero) => ({
        Periodo: item.periodo,
        Ingresos: item.ingresos,
        Gastos: item.gastos,
        Adeudos: item.adeudos,
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reportes');
      const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fileSuffix =
        periodosSeleccionados.length === 0
          ? 'todos'
          : periodosSeleccionados.join('-').toLowerCase().replace(/\s+/g, '-');
      downloadBlob(blob, `reporte-financiero-${fileSuffix}.xlsx`);
      runAction('Exportando Excel...', 'Reporte Excel descargado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo exportar Excel');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const descargarReportePdf = async () => {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      page.drawText('Reporte financiero Elyx', {
        x: 40,
        y: height - 50,
        size: 16,
        font: bold,
        color: rgb(0.1, 0.2, 0.35),
      });
      page.drawText(`Periodo: ${periodosSeleccionados.length === 0 ? 'Todos' : periodosSeleccionados.join(', ')}`, {
        x: 40,
        y: height - 74,
        size: 11,
        font,
      });

      let y = height - 110;
      const lines = reportesFiltrados.length
        ? reportesFiltrados.map(
            (item: ReporteFinanciero) =>
              `${item.periodo} | Ingresos: $${item.ingresos.toLocaleString('es-MX')} | Gastos: $${item.gastos.toLocaleString('es-MX')} | Adeudos: $${item.adeudos.toLocaleString('es-MX')}`,
          )
        : ['No hay informacion para el periodo seleccionado'];

      for (const line of lines) {
        page.drawText(line, { x: 40, y, size: 10, font });
        y -= 18;
        if (y < 40) {
          break;
        }
      }

      const bytes = await pdfDoc.save();
      const pdfBytes = new Uint8Array(bytes.length);
      pdfBytes.set(bytes);
      const blob = new Blob([pdfBytes], {
        type: 'application/pdf',
      });
      const fileSuffix =
        periodosSeleccionados.length === 0
          ? 'todos'
          : periodosSeleccionados.join('-').toLowerCase().replace(/\s+/g, '-');
      downloadBlob(blob, `reporte-financiero-${fileSuffix}.pdf`);
      runAction('Exportando PDF...', 'Reporte PDF descargado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo exportar PDF');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const alternarPeriodoReporte = (periodo: string) => {
    setPeriodosSeleccionados((prev) =>
      prev.includes(periodo) ? prev.filter((item) => item !== periodo) : [...prev, periodo],
    );
  };

  const generarReporteFinanzasAdmin = () => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const periodo = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const ingresos = cuotasScoped.reduce((sum: number, cuota: Cuota) => {
      return cuota.status === 'PAGADA' ? sum + cuota.monto : sum;
    }, 0);
    const gastos = gastosScoped.reduce((sum: number, gasto: Gasto) => sum + gasto.monto, 0);
    const adeudos = cuotasScoped.reduce((sum: number, cuota: Cuota) => {
      return cuota.status !== 'PAGADA' ? sum + cuota.monto + cuota.recargo : sum;
    }, 0);

    patchAppData((prev) => {
      const nuevoReporte: ReporteFinanciero = {
        idCondominio: effectiveActiveCondominioId,
        periodo,
        ingresos,
        gastos,
        adeudos,
      };

      const reportesSinPeriodo = prev.reportes.filter(
        (item: ReporteFinanciero) => !(item.idCondominio === effectiveActiveCondominioId && item.periodo === periodo),
      );

      return {
        ...prev,
        reportes: [nuevoReporte, ...reportesSinPeriodo],
      };
    });

    runAction('Generando reporte...', 'Reporte financiero generado');
  };

  const exportarExcelFinanzasAdmin = async () => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const rows = reportesScoped.map((item: ReporteFinanciero) => ({
        Periodo: item.periodo,
        Ingresos: item.ingresos,
        Gastos: item.gastos,
        Adeudos: item.adeudos,
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Finanzas');
      const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, `finanzas-condominio-${effectiveActiveCondominioId}.xlsx`);
      runAction('Exportando Excel...', 'Excel descargado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo exportar Excel de finanzas');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const actualizarEstadoMantenimiento = async (id: number, estado: MantenimientoStatus) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const actualizado = await backendApi.updateReporteMantenimientoEstado({
        idCondominio: effectiveActiveCondominioId,
        idReporte: id,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        estado,
      });

      patchAppData((prev) => ({
        ...prev,
        mantenimientos: prev.mantenimientos.map((item: MantenimientoReporte) =>
          item.id === id && item.idCondominio === effectiveActiveCondominioId
            ? {
                ...item,
                ...actualizado,
                id: actualizado.id > 0 ? actualizado.id : item.id,
                idCondominio: actualizado.idCondominio > 0 ? actualizado.idCondominio : item.idCondominio,
                unidad: actualizado.unidad || item.unidad,
                descripcion: actualizado.descripcion || item.descripcion,
              }
            : item,
        ),
      }));

      runAction('Actualizando estado...', `Estado actualizado a ${statusLabel[estado]}`);
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo actualizar el estado en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const subirFotoMantenimiento = async (idReporte: number, files: File[], tipo: 'REPORTE' | 'RESOLUCION') => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const validFiles = files.filter((f) => f.size <= 5 * 1024 * 1024);
    if (validFiles.length < files.length) {
      setFeedback('Alguna(s) foto(s) superan el limite de 5 MB y fueron omitidas');
      window.setTimeout(() => setFeedback(null), 2800);
    }
    if (validFiles.length === 0) {
      return;
    }

    const nuevasFotos: FotoMantenimiento[] = [];
    let errores = 0;

    for (const file of validFiles) {
      try {
        const foto = await backendApi.createFotoMantenimiento({
          idCondominio: effectiveActiveCondominioId,
          idReporte,
          tipo,
          nombreArchivo: file.name,
          archivo: file,
        });
        nuevasFotos.push(foto);
      } catch {
        errores++;
      }
    }

    if (nuevasFotos.length > 0) {
      setFotosPorReporte((prev) => ({
        ...prev,
        [idReporte]: [...nuevasFotos, ...(prev[idReporte] ?? [])],
      }));
    }

    const msg = `${nuevasFotos.length} foto(s) cargada(s)${errores > 0 ? `, ${errores} error(es)` : ''}`;
    runAction('Subiendo fotos...', msg);
  };

  const eliminarFotoMantenimiento = async (idFoto: number, idReporte: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    try {
      await backendApi.deleteFotoMantenimiento({
        idCondominio: effectiveActiveCondominioId,
        idFoto,
      });

      setFotosPorReporte((prev) => ({
        ...prev,
        [idReporte]: (prev[idReporte] ?? []).filter((f) => f.idFoto !== idFoto),
      }));

      runAction('Eliminando foto...', 'Foto eliminada correctamente');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo eliminar la foto del backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const registrarGasto = async () => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const concepto = gastoConcepto.trim();
    const categoria = gastoCategoria.trim();
    const monto = Number(gastoMonto);

    if (!concepto || !categoria || Number.isNaN(monto) || monto <= 0) {
      setFeedback('Completa correctamente concepto, categoria y monto');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const gasto = await backendApi.createGasto({
        idCondominio: effectiveActiveCondominioId,
        concepto,
        categoria,
        monto,
      });

      patchAppData((prev) => ({
        ...prev,
        gastos: [gasto, ...prev.gastos],
      }));

      setGastoConcepto('');
      setGastoCategoria('');
      setGastoMonto('');
      runAction('Guardando gasto...', 'Gasto registrado con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo registrar el gasto en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const guardarConfigNotificaciones = async () => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const config = await backendApi.upsertConfigNotificaciones({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominio: activeMembership.idUsuarioCondominio,
        diasAntes: configNotificaciones.diasAntes,
        diasDespues: configNotificaciones.diasDespues,
        usarEmail: configNotificaciones.usarEmail,
        usarInterna: configNotificaciones.usarInterna,
        activo: configNotificaciones.activo,
      });

      setConfigNotificaciones({
        diasAntes: config.diasAntes,
        diasDespues: config.diasDespues,
        usarEmail: config.usarEmail,
        usarInterna: config.usarInterna,
        activo: config.activo,
      });

      runAction('Guardando preferencias...', 'Preferencias de notificaciones actualizadas');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const marcarNotificacionLeida = async (idNotificacion: number) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      await backendApi.marcarNotificacionLeida({
        idCondominio: effectiveActiveCondominioId,
        idNotificacion,
      });

      setNotificacionesRecientes((prev) =>
        prev.map((item) =>
          item.idNotificacion === idNotificacion
            ? {
                ...item,
                estado: 'LEIDA',
              }
            : item,
        ),
      );
      runAction('Marcando notificacion...', 'Notificacion marcada como leida');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const actualizarCorreoPerfil = async () => {
    if (!sessionUser) {
      return;
    }

    const correoNuevo = perfil.correo.trim().toLowerCase();
    if (!correoNuevo) {
      setFeedback('Ingresa un correo valido.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const updated = await backendApi.updatePerfilCorreo(correoNuevo);
      setSessionUser((prev) => (prev ? { ...prev, correo: updated.correo } : prev));
      setPerfil((prev) => ({ ...prev, correo: updated.correo }));
      runAction('Actualizando correo...', 'Correo actualizado correctamente');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cambiarPasswordForzado = async () => {
    const actual = perfil.passwordActual.trim();
    const nueva = perfil.passwordNueva.trim();

    if (!actual || !nueva) {
      setCambioFeedback('Completa ambos campos.');
      return;
    }

    if (nueva.length < 8) {
      setCambioFeedback('La contrasena nueva debe tener al menos 8 caracteres.');
      return;
    }

    try {
      await backendApi.changePassword(actual, nueva);
      setPerfil((prev) => ({ ...prev, passwordActual: '', passwordNueva: '' }));
      setRequiereCambio(false);
      setCambioFeedback(null);

      const loadedData = seedData(sessionUser);
      const loadedRole = sessionUser?.role ?? 'condomino';
      setAppData(loadedData);
      setRole(loadedRole);

      const activeMembresias = sessionUser?.membresias?.filter(
        (item: UserMembership) => item.estado === 'ACTIVO',
      ) ?? [];

      if (activeMembresias.length > 0) {
        const persisted = getPersistedActiveCondominio(sessionUser?.correo ?? '');
        const valid = persisted ? activeMembresias.find((m: UserMembership) => m.idCondominio === persisted) : undefined;
        const idCondominio = valid?.idCondominio ?? activeMembresias[0]?.idCondominio ?? 0;
        setActiveCondominioId(idCondominio);
        persistActiveCondominio(sessionUser?.correo ?? '', idCondominio);
      }

      setActiveView('inicio');
      setMenuOpen(false);
      setCuotaCambioForm(DEFAULT_CUOTA_CAMBIO_FORM);
      setVotacionesCambioCuota([]);
      setFeedback('Contrasena actualizada. Bienvenido a Elyx');
      window.setTimeout(() => setFeedback(null), 2200);
    } catch (error) {
      console.error(error);
      setCambioFeedback(extractApiErrorMessage(error));
    }
  };

  const actualizarPasswordPerfil = async () => {
    const actual = perfil.passwordActual.trim();
    const nueva = perfil.passwordNueva.trim();

    if (!actual || !nueva) {
      setFeedback('Completa password actual y nueva.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      await backendApi.changePassword(actual, nueva);
      setPerfil((prev) => ({ ...prev, passwordActual: '', passwordNueva: '' }));
      runAction('Actualizando password...', 'Password actualizada correctamente');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cargarSolicitudesCambio = async () => {
    if (!isAuthenticated || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const items = await backendApi.listSolicitudesCambio({
        idCondominio: effectiveActiveCondominioId,
      });

      if (role === 'administrador') {
        setSolicitudesCambio(items);
        return;
      }

      if (role === 'condomino') {
        setSolicitudesCambio(
          items.filter(
            (item) => item.idUsuarioCondominioSolicitante === activeMembership.idUsuarioCondominio,
          ),
        );
        return;
      }

      setSolicitudesCambio([]);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cargarUnidadesDisponiblesAdmin = async () => {
    if (!isAuthenticated || role !== 'administrador' || !effectiveActiveCondominioId) {
      setUnidadesDisponibles([]);
      return;
    }

    try {
      const items = await backendApi.listUnidadesDisponibles({
        idCondominio: effectiveActiveCondominioId,
      });
      setUnidadesDisponibles(items);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cargarUnidadesConOcupantes = async () => {
    if (!isAuthenticated || role !== 'administrador' || !effectiveActiveCondominioId) {
      setUnidadesConOcupantes([]);
      return;
    }

    try {
      const items = await backendApi.listUnidadesConOcupantes({
        idCondominio: effectiveActiveCondominioId,
      });
      setUnidadesConOcupantes(items);
    } catch (error) {
      console.error(error);
    }
  };

  const cargarVotacionesCambioCuota = async () => {
    if (role !== 'administrador' || !effectiveActiveCondominioId) {
      setVotacionesCambioCuota([]);
      return;
    }

    try {
      const items = await backendApi.listCambiosCuota(effectiveActiveCondominioId);
      setVotacionesCambioCuota(items);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const crearSolicitudCambioCondomino = async () => {
    if (role !== 'condomino' || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const motivo = solicitudForm.motivo.trim();
    if (motivo.length < 5) {
      setFeedback('El motivo debe tener al menos 5 caracteres.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    const payload: {
      idCondominio: number;
      idUsuarioCondominioSolicitante: number;
      idUsuarioCondominioObjetivo: number;
      tipo: 'BAJA_CONDOMINO' | 'CAMBIO_UNIDAD' | 'CAMBIO_OCUPACION';
      motivo: string;
      detalle?: Record<string, unknown>;
    } = {
      idCondominio: effectiveActiveCondominioId,
      idUsuarioCondominioSolicitante: activeMembership.idUsuarioCondominio,
      idUsuarioCondominioObjetivo: activeMembership.idUsuarioCondominio,
      tipo: solicitudForm.tipo,
      motivo,
    };

    if (solicitudForm.tipo === 'CAMBIO_UNIDAD') {
      const idUnidad = Number(solicitudForm.idUnidadDestino);
      if (!Number.isInteger(idUnidad) || idUnidad <= 0) {
        setFeedback('Para cambio de unidad, ingresa un ID de unidad valido.');
        window.setTimeout(() => setFeedback(null), 2200);
        return;
      }
      payload.detalle = { idUnidadDestino: idUnidad };
    }

    try {
      const created = await backendApi.createSolicitudCambio(payload);
      setSolicitudesCambio((prev) => [created, ...prev]);
      setSolicitudForm(DEFAULT_SOLICITUD_FORM);
      runAction('Enviando solicitud...', `Solicitud #${created.idSolicitud} registrada y enviada al admin`);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const crearAltaCondominoAdmin = async () => {
    if (role !== 'administrador' || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const nombre = altaCondominoForm.nombre.trim();
    const apellidoPaterno = altaCondominoForm.apellidoPaterno.trim();
    const correo = altaCondominoForm.correo.trim().toLowerCase();
    const idUnidad = Number(altaCondominoForm.idUnidad);

    if (!nombre || !apellidoPaterno || !correo) {
      setFeedback('Completa nombre, apellido paterno y correo del condomino.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (!Number.isInteger(idUnidad) || idUnidad <= 0) {
      setFeedback('Selecciona una unidad vacia disponible.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const created = await backendApi.createAltaCondominoAdmin({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        nombre,
        apellidoPaterno,
        correo,
        idUnidad,
        tipoOcupacion: altaCondominoForm.tipoOcupacion,
      });

      setAltaCondominoForm(DEFAULT_ALTA_CONDOMINO_FORM);
      await Promise.all([cargarUnidadesDisponiblesAdmin(), cargarUnidadesConOcupantes(), cargarSolicitudesCambio()]);
      runAction(
        'Registrando alta de condomino...',
        created.passwordTemporal
          ? `Condomino creado. Password temporal: ${created.passwordTemporal}`
          : 'Condomino reutilizado y asignado correctamente.',
      );
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2600);
    }
  };

  const resolverSolicitudCambioAdmin = async (
    idSolicitud: number,
    accion: 'aprobar' | 'rechazar' | 'ejecutar',
  ) => {
    if (role !== 'administrador' || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const commonInput = {
        idCondominio: effectiveActiveCondominioId,
        idSolicitud,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
      };

      const updated =
        accion === 'aprobar'
          ? await backendApi.aprobarSolicitudCambio(commonInput)
          : accion === 'rechazar'
            ? await backendApi.rechazarSolicitudCambio(commonInput)
            : await backendApi.ejecutarSolicitudCambio(commonInput);

      setSolicitudesCambio((prev) =>
        prev.map((item) => (item.idSolicitud === updated.idSolicitud ? updated : item)),
      );

      const verbo = accion === 'aprobar' ? 'aprobada' : accion === 'rechazar' ? 'rechazada' : 'ejecutada';
      runAction('Actualizando solicitud...', `Solicitud #${idSolicitud} ${verbo}`);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    void cargarSolicitudesCambio();
  }, [isAuthenticated, role, effectiveActiveCondominioId, activeMembership?.idUsuarioCondominio]);

  useEffect(() => {
    if (!isAuthenticated || role !== 'administrador' || !effectiveActiveCondominioId) {
      setVotacionesCambioCuota([]);
      return;
    }

    void cargarVotacionesCambioCuota();
  }, [isAuthenticated, role, effectiveActiveCondominioId]);

  useEffect(() => {
    if (!isAuthenticated || role !== 'administrador' || !effectiveActiveCondominioId) {
      setUnidadesDisponibles([]);
      setUnidadesConOcupantes([]);
      return;
    }

    void cargarUnidadesDisponiblesAdmin();
    void cargarUnidadesConOcupantes();
  }, [isAuthenticated, role, effectiveActiveCondominioId]);

  const crearOnboardingInicial = async () => {
    if (role !== 'superusuario') {
      return;
    }

    const adminsValidos = superOnboarding.admins.filter(
      (item) => item.nombre.trim() && item.apellidoPaterno.trim() && item.correo.trim(),
    );
    const condominosValidos = superOnboarding.condominos.filter(
      (item) =>
        item.nombre.trim() &&
        item.apellidoPaterno.trim() &&
        item.correo.trim() &&
        item.claveUnidad.trim() &&
        item.tipoUnidad,
    );
    const unidadesValidas = superOnboarding.unidades.filter((item) => item.claveUnidad.trim());

    if (
      !superOnboarding.nombreCondominio.trim() ||
      adminsValidos.length === 0 ||
      condominosValidos.length === 0
    ) {
      setFeedback('Completa condominio, al menos un admin y un condomino con unidad asignada.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    const correos = [...adminsValidos, ...condominosValidos].map((item) => item.correo.trim().toLowerCase());
    if (new Set(correos).size !== correos.length) {
      setFeedback('No se permiten correos repetidos entre admins y condominos.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    const clavesUnidadesCondominos = condominosValidos.map((item) => item.claveUnidad.trim().toLowerCase());
    const clavesUnidadesExtras = unidadesValidas.map((item) => item.claveUnidad.trim().toLowerCase());
    const clavesUnidades = [...clavesUnidadesCondominos, ...clavesUnidadesExtras];
    if (new Set(clavesUnidades).size !== clavesUnidades.length) {
      setFeedback('No se permiten claves de unidad repetidas.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    const montoCuotaInicial = Number(superOnboarding.montoCuotaInicial);
    const diaLimitePago = Number(superOnboarding.diaLimitePago);
    const recargoFijoPorDia = Number(superOnboarding.recargoFijoPorDia);
    const periodoAplicacionInicial = superOnboarding.periodoAplicacionInicial.trim();
    const fechaInicioCobro = superOnboarding.fechaInicioCobro.trim();

    if (!Number.isFinite(montoCuotaInicial) || montoCuotaInicial < 0.01) {
      setFeedback('El monto de cuota inicial debe ser mayor o igual a 0.01.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (!Number.isInteger(diaLimitePago) || diaLimitePago < 1 || diaLimitePago > 28) {
      setFeedback('El dia limite de pago debe estar entre 1 y 28.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (!Number.isFinite(recargoFijoPorDia) || recargoFijoPorDia < 0) {
      setFeedback('El recargo fijo por dia debe ser un numero mayor o igual a 0.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodoAplicacionInicial)) {
      setFeedback('El periodo de aplicacion inicial debe tener formato YYYY-MM.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    if (!fechaInicioCobro) {
      setFeedback('La fecha de inicio de cobro es obligatoria.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    const matchFechaInicio = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaInicioCobro);
    if (!matchFechaInicio) {
      setFeedback('La fecha de inicio de cobro no es valida.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    const year = Number(matchFechaInicio[1]);
    const month = Number(matchFechaInicio[2]);
    const day = Number(matchFechaInicio[3]);
    const inicioDate = new Date(year, month - 1, day);
    const hoy = new Date();
    const inicioBase = new Date(year, month - 1, day);
    const hoyBase = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (
      Number.isNaN(inicioDate.getTime()) ||
      inicioDate.getFullYear() !== year ||
      inicioDate.getMonth() !== month - 1 ||
      inicioDate.getDate() !== day ||
      inicioBase < hoyBase
    ) {
      setFeedback('La fecha de inicio de cobro no puede ser pasada.');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const adminPrincipal = adminsValidos[0];
      const condominoPrincipal = condominosValidos[0];
      const created = await backendApi.createOnboardingInicial({
        nombreCondominio: superOnboarding.nombreCondominio.trim(),
        direccionCondominio: superOnboarding.direccionCondominio.trim() || undefined,
        nombreAdmin: adminPrincipal.nombre.trim(),
        apellidoPaternoAdmin: adminPrincipal.apellidoPaterno.trim(),
        correoAdmin: adminPrincipal.correo.trim().toLowerCase(),
        nombreCondomino: condominoPrincipal.nombre.trim(),
        apellidoPaternoCondomino: condominoPrincipal.apellidoPaterno.trim(),
        correoCondomino: condominoPrincipal.correo.trim().toLowerCase(),
        claveUnidadCondomino: condominoPrincipal.claveUnidad.trim(),
        tipoUnidadCondomino: condominoPrincipal.tipoUnidad,
        admins: adminsValidos.slice(1).map((item) => ({
          nombre: item.nombre.trim(),
          apellidoPaterno: item.apellidoPaterno.trim(),
          correo: item.correo.trim().toLowerCase(),
        })),
        condominos: condominosValidos.slice(1).map((item) => ({
          nombre: item.nombre.trim(),
          apellidoPaterno: item.apellidoPaterno.trim(),
          correo: item.correo.trim().toLowerCase(),
          claveUnidad: item.claveUnidad.trim(),
          tipoUnidad: item.tipoUnidad,
        })),
        montoCuotaInicial,
        diaLimitePago,
        recargoFijoPorDia,
        periodoAplicacionInicial,
        fechaInicioCobro,
        unidades: unidadesValidas.map((item) => ({
          claveUnidad: item.claveUnidad.trim(),
          tipoUnidad: item.tipoUnidad,
        })),
      });

      setSuperOnboarding(DEFAULT_SUPER_ONBOARDING);
      setSuperOnboardingResult({
        idCondominio: created.idCondominio,
        adminsCreados: created.adminsCreados,
        condominosCreados: created.condominosCreados,
        unidadesCreadas: created.unidadesCreadas,
        ocupacionesCreadas: created.ocupacionesCreadas,
        cuotasInicialesCreadas: created.cuotasInicialesCreadas,
        cuotaInicial: created.cuotaInicial,
        advertenciaCuotas: created.advertenciaCuotas,
      });
      await cargarSuperCondominios();
      setFeedback(`Onboarding creado para condominio ${created.idCondominio} con ${created.adminsCreados.length} admin(s) y ${created.condominosCreados.length} condomino(s).`);
      window.setTimeout(() => setFeedback(null), 6500);
      runAction('Creando onboarding...', 'Condominio y usuarios iniciales creados');
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cargarSuperCondominios = async () => {
    if (role !== 'superusuario') {
      return;
    }

    try {
      const items = await backendApi.listSuperCondominios();
      setSuperCondominios(items);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cambiarEstadoCondominio = async (idCondominio: number, estado: 'ACTIVO' | 'INACTIVO') => {
    if (role !== 'superusuario') {
      return;
    }

    try {
      const updated = await backendApi.updateSuperCondominioEstado({
        idCondominio,
        estado,
      });
      setSuperCondominios((prev) =>
        prev.map((item) => (item.idCondominio === idCondominio ? updated : item)),
      );
      setFeedback(
        `Condominio ${updated.idCondominio} actualizado a estado ${updated.estado}.`,
      );
      window.setTimeout(() => setFeedback(null), 2600);
    } catch (error) {
      console.error(error);
      setFeedback(extractApiErrorMessage(error));
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  useEffect(() => {
    if (isAuthenticated && role === 'superusuario') {
      void cargarSuperCondominios();
    }
  }, [isAuthenticated, role]);

  if (!isAuthenticated || requiereCambio) {
    return (
      <LoginPage
        correo={correo}
        password={password}
        loginError={loginError}
        loadingLabel={loadingLabel}
        feedback={feedback}
        requiereCambio={requiereCambio}
        cambioFeedback={cambioFeedback}
        passwordActual={perfil.passwordActual}
        passwordNueva={perfil.passwordNueva}
        onCorreoChange={setCorreo}
        onPasswordChange={setPassword}
        onLogin={handleLogin}
        onPerfilChange={setPerfil}
        onCambiarPasswordForzado={cambiarPasswordForzado}
      />
    );
  }

  if (role === 'superusuario') {
    return (
      <SuperuserPage
        sessionName={`${sessionUser?.nombre ?? 'Superusuario'} (${sessionUser?.correo ?? ''})`}
        loadingLabel={loadingLabel}
        feedback={feedback}
        nombreCondominio={superOnboarding.nombreCondominio}
        direccionCondominio={superOnboarding.direccionCondominio}
        montoCuotaInicial={superOnboarding.montoCuotaInicial}
        diaLimitePago={superOnboarding.diaLimitePago}
        recargoFijoPorDia={superOnboarding.recargoFijoPorDia}
        periodoAplicacionInicial={superOnboarding.periodoAplicacionInicial}
        fechaInicioCobro={superOnboarding.fechaInicioCobro}
        admins={superOnboarding.admins}
        condominos={superOnboarding.condominos}
        unidades={superOnboarding.unidades}
        createdSummary={superOnboardingResult}
        superSection={superSection}
        condominios={superCondominios}
        onSectionChange={setSuperSection}
        onRefreshCondominios={cargarSuperCondominios}
        onToggleCondominioEstado={cambiarEstadoCondominio}
        onNombreCondominioChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            nombreCondominio: value,
          }))
        }
        onDireccionCondominioChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            direccionCondominio: value,
          }))
        }
        onMontoCuotaInicialChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            montoCuotaInicial: value,
          }))
        }
        onDiaLimitePagoChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            diaLimitePago: value,
          }))
        }
        onRecargoFijoPorDiaChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            recargoFijoPorDia: value,
          }))
        }
        onPeriodoAplicacionInicialChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            periodoAplicacionInicial: value,
          }))
        }
        onFechaInicioCobroChange={(value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            fechaInicioCobro: value,
          }))
        }
        onUserFieldChange={(group, index, field, value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            [group]: prev[group].map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    [field]: value,
                  }
                : item,
            ),
          }))
        }
        onAddUser={(group) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            [group]: [...prev[group], { ...EMPTY_SUPER_USER }],
          }))
        }
        onRemoveUser={(group, index) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            [group]: prev[group].filter((_, itemIndex) => itemIndex !== index),
          }))
        }
        onSubmit={crearOnboardingInicial}
        onUnidadFieldChange={(index, field, value) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            unidades: prev.unidades.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    [field]: value,
                  }
                : item,
            ),
          }))
        }
        onAddUnidad={() =>
          setSuperOnboarding((prev) => ({
            ...prev,
            unidades: [...prev.unidades, { ...EMPTY_SUPER_UNIDAD }],
          }))
        }
        onRemoveUnidad={(index) =>
          setSuperOnboarding((prev) => ({
            ...prev,
            unidades: prev.unidades.filter((_, itemIndex) => itemIndex !== index),
          }))
        }
        onLogout={cerrarSesion}
      />
    );
  }

  return (
    <DashboardPage
      role={role}
      sessionUser={sessionUser}
      navItems={navItems}
      activeView={activeView}
      menuOpen={menuOpen}
      appData={scopedData}
      condominiosDisponibles={condominiosDisponibles}
      activeCondominioId={effectiveActiveCondominioId ?? 0}
      panelStats={{
        avisos: avisosScoped.length,
        votaciones: votacionesScoped.length,
        cuotasPendientes: cuotasPendientes.length,
        mantenimientosAbiertos,
      }}
      cobranzaProgreso={cobranzaProgreso}
      cobranzaPagadas={cuotasPagadas}
      cobranzaTotal={cobranzaResumen.total}
      panelReminders={panelReminders}
      saldoActual={saldoActual}
      balanceMensual={balanceMensual}
      pagosPendientesAdminCount={pagosPendientesAdmin.length}
      avisosRecientes={avisosScoped}
      votacionesActivas={votacionesScoped}
      gastosRecientes={gastosRecientes}
      evidenciasPorPago={evidenciasPorPago}
      fotosPorReporte={fotosPorReporte}
      fotosReporte={fotosReporte}
      onFotosReporteChange={setFotosReporte}
      falla={falla}
      avisoTitulo={avisoTitulo}
      avisoMensaje={avisoMensaje}
      votacionPregunta={votacionPregunta}
      cuotaCambioForm={cuotaCambioForm}
      votacionesCambioCuota={votacionesCambioCuota}
      gastoConcepto={gastoConcepto}
      gastoCategoria={gastoCategoria}
      gastoMonto={gastoMonto}
      configNotificaciones={configNotificaciones}
      notificacionesRecientes={notificacionesRecientes}
      onboardingForm={onboardingForm}
      perfil={perfil}
      solicitudForm={solicitudForm}
      altaCondominoForm={altaCondominoForm}
      unidadesDisponibles={unidadesDisponibles}
      unidadesConOcupantes={unidadesConOcupantes}
      solicitudesCambio={solicitudesCambio}
      loadingLabel={loadingLabel}
      feedback={feedback}
      onToggleMenu={() => setMenuOpen((prev: boolean) => !prev)}
      onChangeCondominio={handleCondominioChange}
      onCloseMenu={closeMobileMenu}
      onSetView={setActiveView}
      onLogout={cerrarSesion}
      onRegistrarPago={registrarPagoCondomino}
      onSubirComprobante={subirComprobante}
      onEliminarEvidenciaPago={eliminarEvidenciaPago}
      onDescargarReciboCuota={descargarReciboCuota}
      onAprobarPago={aprobarPago}
      onRechazarPago={rechazarPago}
      onGenerarReciboPago={generarReciboPago}
      onVotar={votar}
      onCrearVotacion={crearVotacion}
      onCerrarVotacion={cerrarVotacion}
      onPublicarAviso={publicarAviso}
      onFallaChange={setFalla}
      onAvisoTituloChange={setAvisoTitulo}
      onAvisoMensajeChange={setAvisoMensaje}
      onVotacionPreguntaChange={setVotacionPregunta}
      onCuotaCambioFormChange={setCuotaCambioForm}
      onEnviarReporteMantenimiento={enviarReporteMantenimiento}
      onCrearVotacionCambioCuota={crearVotacionCambioCuota}
      onEjecutarCambioCuota={ejecutarCambioCuota}
      onActualizarEstadoMantenimiento={actualizarEstadoMantenimiento}
      onSubirFotoMantenimiento={subirFotoMantenimiento}
      onEliminarFotoMantenimiento={eliminarFotoMantenimiento}
      onGastoConceptoChange={setGastoConcepto}
      onGastoCategoriaChange={setGastoCategoria}
      onGastoMontoChange={setGastoMonto}
      onRegistrarGasto={registrarGasto}
      onConfigNotificacionesChange={setConfigNotificaciones}
      onGuardarConfigNotificaciones={guardarConfigNotificaciones}
      onOnboardingFormChange={(key, value) =>
        setOnboardingForm((prev) => ({
          ...prev,
          [key]: value,
        }))
      }
      onCrearOnboardingInicial={crearOnboardingInicial}
      onMarcarNotificacionLeida={marcarNotificacionLeida}
      onPerfilChange={setPerfil}
      onActualizarCorreoPerfil={actualizarCorreoPerfil}
      onActualizarPasswordPerfil={actualizarPasswordPerfil}
      onSolicitudFormChange={setSolicitudForm}
      onCrearSolicitudCambio={crearSolicitudCambioCondomino}
      onRefreshSolicitudesCambio={cargarSolicitudesCambio}
      onResolverSolicitudCambio={resolverSolicitudCambioAdmin}
      onAltaCondominoFormChange={setAltaCondominoForm}
      onCrearAltaCondomino={crearAltaCondominoAdmin}
      onRefreshUnidadesDisponibles={cargarUnidadesDisponiblesAdmin}
      periodosSeleccionados={periodosSeleccionados}
      periodosDisponibles={periodosDisponibles}
      onAlternarPeriodoReporte={alternarPeriodoReporte}
      onDescargarReportePdf={descargarReportePdf}
      onDescargarReporteExcel={descargarReporteExcel}
      onGenerarReporteFinanzas={generarReporteFinanzasAdmin}
      onExportarExcelFinanzas={exportarExcelFinanzasAdmin}
      onRunAction={runAction}
      formatShortDate={formatShortDate}
    />
  );
}

function App() {
  return (
    <ActiveCondominioProvider>
      <AppContent />
    </ActiveCondominioProvider>
  );
}

export default App;
