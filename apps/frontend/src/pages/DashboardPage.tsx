import type {
  AppData,
  Condominio,
  DemoUser,
  MantenimientoStatus,
  RoleKey,
  ViewKey,
  VoteChoice,
} from '../types/app';
import type { NavItem } from '../types/app';
import { statusLabel } from '../constants/status';
import { CondominioSwitcher } from '../components/CondominioSwitcher';
import { Icon } from '../components/Icon';

type DashboardPageProps = {
  role: RoleKey;
  sessionUser: DemoUser | null;
  navItems: NavItem[];
  activeView: ViewKey;
  menuOpen: boolean;
  appData: AppData;
  condominiosDisponibles: Condominio[];
  activeCondominioId: number;
  panelStats: {
    avisos: number;
    votaciones: number;
    cuotasPendientes: number;
    mantenimientosAbiertos: number;
  };
  cobranzaProgreso: number;
  cobranzaPagadas: number;
  cobranzaTotal: number;
  panelReminders: string[];
  saldoActual: number;
  balanceMensual: number;
  pagosPendientesAdminCount: number;
  avisosRecientes: AppData['avisos'];
  votacionesActivas: AppData['votacionesActivas'];
  gastosRecientes: AppData['gastos'];
  evidenciasPorPago: Record<
    number,
    Array<{
      idEvidencia: number;
      idPago: number;
      idCondominio: number;
      nombreArchivo: string;
      urlArchivo: string;
      fechaCarga: string;
    }>
  >;
  falla: string;
  avisoTitulo: string;
  avisoMensaje: string;
  votacionPregunta: string;
  cuotaCambioForm: {
    montoPropuesto: string;
    recargoPropuesto: string;
    diaLimitePropuesto: string;
    motivo: string;
  };
  votacionesCambioCuota: AppData['votacionesActivas'];
  gastoConcepto: string;
  gastoCategoria: string;
  gastoMonto: string;
  configNotificaciones: {
    diasAntes: number;
    diasDespues: number;
    usarEmail: boolean;
    usarInterna: boolean;
    activo: boolean;
  };
  notificacionesRecientes: Array<{
    idNotificacion: number;
    asunto: string;
    canal: string;
    estado: string;
    fechaProgramada: string;
  }>;
  onboardingForm: {
    nombreCondominio: string;
    direccionCondominio: string;
    nombreAdmin: string;
    apellidoPaternoAdmin: string;
    correoAdmin: string;
    nombreCondomino: string;
    apellidoPaternoCondomino: string;
    correoCondomino: string;
  };
  perfil: {
    correo: string;
    passwordActual: string;
    passwordNueva: string;
  };
  solicitudForm: {
    tipo: 'BAJA_CONDOMINO' | 'CAMBIO_UNIDAD';
    motivo: string;
    idUnidadDestino: string;
  };
  solicitudesCambio: Array<{
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
  }>;
  loadingLabel: string | null;
  feedback: string | null;
  onToggleMenu: () => void;
  onChangeCondominio: (condominioId: number) => void;
  onCloseMenu: () => void;
  onSetView: (view: ViewKey) => void;
  onLogout: () => void;
  onRegistrarPago: (cuotaId: number) => void;
  onSubirComprobante: (cuotaId: number, file: File) => void;
  onDescargarReciboCuota: (cuotaId: number) => void;
  onAprobarPago: (idPago: number) => void;
  onRechazarPago: (idPago: number) => void;
  onGenerarReciboPago: (idPago: number) => void;
  onVotar: (votacionId: number, choice: VoteChoice) => void;
  onCrearVotacion: () => void;
  onCerrarVotacion: (votacionId: number) => void;
  onPublicarAviso: () => void;
  onFallaChange: (value: string) => void;
  onAvisoTituloChange: (value: string) => void;
  onAvisoMensajeChange: (value: string) => void;
  onVotacionPreguntaChange: (value: string) => void;
  onCuotaCambioFormChange: (value: {
    montoPropuesto: string;
    recargoPropuesto: string;
    diaLimitePropuesto: string;
    motivo: string;
  }) => void;
  onEnviarReporteMantenimiento: () => void;
  onCrearVotacionCambioCuota: () => void;
  onEjecutarCambioCuota: (idVotacion: number) => void;
  onActualizarEstadoMantenimiento: (id: number, estado: MantenimientoStatus) => void;
  onGastoConceptoChange: (value: string) => void;
  onGastoCategoriaChange: (value: string) => void;
  onGastoMontoChange: (value: string) => void;
  onRegistrarGasto: () => void;
  onConfigNotificacionesChange: (value: {
    diasAntes: number;
    diasDespues: number;
    usarEmail: boolean;
    usarInterna: boolean;
    activo: boolean;
  }) => void;
  onGuardarConfigNotificaciones: () => void;
  onOnboardingFormChange: (
    key:
      | 'nombreCondominio'
      | 'direccionCondominio'
      | 'nombreAdmin'
      | 'apellidoPaternoAdmin'
      | 'correoAdmin'
      | 'nombreCondomino'
      | 'apellidoPaternoCondomino'
      | 'correoCondomino',
    value: string,
  ) => void;
  onCrearOnboardingInicial: () => void;
  onMarcarNotificacionLeida: (idNotificacion: number) => void;
  onPerfilChange: (value: { correo: string; passwordActual: string; passwordNueva: string }) => void;
  onActualizarCorreoPerfil: () => void;
  onActualizarPasswordPerfil: () => void;
  onSolicitudFormChange: (value: {
    tipo: 'BAJA_CONDOMINO' | 'CAMBIO_UNIDAD';
    motivo: string;
    idUnidadDestino: string;
  }) => void;
  onCrearSolicitudCambio: () => void;
  onRefreshSolicitudesCambio: () => void;
  onResolverSolicitudCambio: (idSolicitud: number, accion: 'aprobar' | 'rechazar' | 'ejecutar') => void;
  periodosSeleccionados: string[];
  periodosDisponibles: string[];
  onAlternarPeriodoReporte: (value: string) => void;
  onDescargarReportePdf: () => void;
  onDescargarReporteExcel: () => void;
  onGenerarReporteFinanzas: () => void;
  onExportarExcelFinanzas: () => void;
  onRunAction: (loading: string, success: string) => void;
  formatShortDate: (isoDate: string) => string;
};

export function DashboardPage({
  role,
  sessionUser,
  navItems,
  activeView,
  menuOpen,
  appData,
  condominiosDisponibles,
  activeCondominioId,
  panelStats,
  cobranzaProgreso,
  cobranzaPagadas,
  cobranzaTotal,
  panelReminders,
  saldoActual,
  balanceMensual,
  pagosPendientesAdminCount,
  avisosRecientes,
  votacionesActivas,
  gastosRecientes,
  evidenciasPorPago,
  falla,
  avisoTitulo,
  avisoMensaje,
  votacionPregunta,
  cuotaCambioForm,
  votacionesCambioCuota,
  gastoConcepto,
  gastoCategoria,
  gastoMonto,
  configNotificaciones,
  notificacionesRecientes,
  onboardingForm,
  perfil,
  solicitudForm,
  solicitudesCambio,
  loadingLabel,
  feedback,
  onToggleMenu,
  onChangeCondominio,
  onCloseMenu,
  onSetView,
  onLogout,
  onRegistrarPago,
  onSubirComprobante,
  onDescargarReciboCuota,
  onAprobarPago,
  onRechazarPago,
  onGenerarReciboPago,
  onVotar,
  onCrearVotacion,
  onCerrarVotacion,
  onPublicarAviso,
  onFallaChange,
  onAvisoTituloChange,
  onAvisoMensajeChange,
  onVotacionPreguntaChange,
  onCuotaCambioFormChange,
  onEnviarReporteMantenimiento,
  onCrearVotacionCambioCuota,
  onEjecutarCambioCuota,
  onActualizarEstadoMantenimiento,
  onGastoConceptoChange,
  onGastoCategoriaChange,
  onGastoMontoChange,
  onRegistrarGasto,
  onConfigNotificacionesChange,
  onGuardarConfigNotificaciones,
  onOnboardingFormChange,
  onCrearOnboardingInicial,
  onMarcarNotificacionLeida,
  onPerfilChange,
  onActualizarCorreoPerfil,
  onActualizarPasswordPerfil,
  onSolicitudFormChange,
  onCrearSolicitudCambio,
  onRefreshSolicitudesCambio,
  onResolverSolicitudCambio,
  periodosSeleccionados,
  periodosDisponibles,
  onAlternarPeriodoReporte,
  onDescargarReportePdf,
  onDescargarReporteExcel,
  onGenerarReporteFinanzas,
  onExportarExcelFinanzas,
  onRunAction,
  formatShortDate,
}: DashboardPageProps) {
  const quickViewButtons =
    role === 'condomino'
      ? ([
          { key: 'pagos' as ViewKey, label: 'Pagos' },
          { key: 'perfil' as ViewKey, label: 'Datos personales' },
          { key: 'avisos' as ViewKey, label: 'Avisos' },
          { key: 'votaciones' as ViewKey, label: 'Votaciones' },
          { key: 'mantenimiento' as ViewKey, label: 'Mantenimiento' },
          { key: 'reportes' as ViewKey, label: 'Reportes' },
        ] as const)
      : ([
          { key: 'validaciones' as ViewKey, label: 'Validaciones' },
          { key: 'perfil' as ViewKey, label: 'Datos personales' },
          { key: 'solicitudes' as ViewKey, label: 'Bajas y cambios' },
          { key: 'avisos' as ViewKey, label: 'Avisos' },
          { key: 'votaciones' as ViewKey, label: 'Votaciones' },
          { key: 'finanzas' as ViewKey, label: 'Reportes' },
        ] as const);

  const solicitudTipoLabel = (tipo: string) => {
    if (tipo === 'BAJA_CONDOMINO') {
      return 'Baja de condomino';
    }
    if (tipo === 'CAMBIO_UNIDAD') {
      return 'Cambio de unidad';
    }
    if (tipo === 'CAMBIO_OCUPACION') {
      return 'Cambio de ocupacion';
    }
    return tipo;
  };

  const votacionesEspecialesActivas = votacionesActivas.filter((item) => item.tipo === 'CAMBIO_CUOTA');
  const votacionesGeneralesActivas = votacionesActivas.filter((item) => item.tipo !== 'CAMBIO_CUOTA');
  const votacionCambioCuotaEnCurso =
    votacionesCambioCuota.find((item) => item.cambioCuota?.estadoPropuesta === 'PENDIENTE') ?? null;

  const solicitudEstadoLabel = (estado: string) => {
    if (estado === 'PENDIENTE') {
      return 'Pendiente';
    }
    if (estado === 'APROBADA') {
      return 'Aprobada';
    }
    if (estado === 'RECHAZADA') {
      return 'Rechazada';
    }
    if (estado === 'EJECUTADA') {
      return 'Ejecutada';
    }
    return estado;
  };

  const formatSolicitudDetalle = (detalle: Record<string, unknown> | null) => {
    if (!detalle) {
      return null;
    }

    const idUnidadDestino = detalle.idUnidadDestino;
    if (typeof idUnidadDestino === 'number' || typeof idUnidadDestino === 'string') {
      return `Unidad destino: ${idUnidadDestino}`;
    }

    return Object.entries(detalle)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(' | ');
  };

  const membresiasActivas = (sessionUser?.membresias ?? []).filter((item) => item.estado === 'ACTIVO');

  const misReportesMantenimiento =
    role === 'condomino'
      ? appData.mantenimientos.filter((item) =>
          membresiasActivas.some((membresia) => membresia.idUsuarioCondominio === item.idUsuarioCondominioReporta),
        )
      : [];

  return (
    <div className="app-bg">
      <div className="app-shell">
        <header className="mobile-bar">
          <h1>Elyx</h1>
          <button className="icon-btn" onClick={onToggleMenu} aria-label="Abrir menu">
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </header>

        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="brand-block">
            <p className="brand-kicker">Plataforma condominal</p>
            <h2>Elyx</h2>
            <p>
              <strong>Operacion diaria en tiempo real</strong>
            </p>
            <p>Pago, validacion, comunicacion y mantenimiento en un solo lugar.</p>
          </div>

          <nav>
            {navItems.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${activeView === item.key ? 'active' : ''}`}
                onClick={() => {
                  onSetView(item.key);
                  onCloseMenu();
                }}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <button
          className={`menu-backdrop ${menuOpen ? 'open' : ''}`}
          aria-label="Cerrar menu"
          onClick={onCloseMenu}
          type="button"
        />

        <main className="content">
          <section className="welcome-card animate-in">
            <h3>{role === 'condomino' ? 'Panel de Condominio' : 'Panel de Administrador'}</h3>
            <CondominioSwitcher
              condominios={condominiosDisponibles}
              activeCondominioId={activeCondominioId}
              onChange={onChangeCondominio}
            />
            <p className="welcome-intro">
              {role === 'condomino'
                ? 'Aqui puedes pagar cuotas, votar en asambleas, reportar incidencias y descargar comprobantes.'
                : 'Aqui puedes validar pagos, publicar avisos y mantener al dia la operacion financiera.'}
            </p>
            <div className="welcome-meta-grid">
              <div className="context-pill">
                <span>Votaciones activas</span>
                <strong>{panelStats.votaciones}</strong>
              </div>
              <div className="context-pill">
                <span>Avisos activos</span>
                <strong>{panelStats.avisos}</strong>
              </div>
              <div className="context-pill">
                <span>{role === 'condomino' ? 'Cuotas pendientes' : 'Mantenimientos abiertos'}</span>
                <strong>{role === 'condomino' ? panelStats.cuotasPendientes : panelStats.mantenimientosAbiertos}</strong>
              </div>
            </div>
            <div className="progress-block" aria-label="Progreso de cobranza del condominio">
              <div className="progress-header">
                <strong>Progreso de cobranza</strong>
                <span>{cobranzaProgreso}%</span>
              </div>
              <div className="progress-track" role="progressbar" aria-valuenow={cobranzaProgreso} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-fill" style={{ width: `${cobranzaProgreso}%` }} />
              </div>
              <small className="helper-text">
                Cuotas pagadas: {cobranzaPagadas} de {cobranzaTotal}
              </small>
            </div>
            <div className="quick-links" role="tablist" aria-label="Accesos rapidos del panel">
              {quickViewButtons.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`quick-link-btn ${activeView === item.key ? 'active' : ''}`}
                  onClick={() => onSetView(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="reminder-box" aria-live="polite">
              <p className="reminder-title">Recordatorios de hoy</p>
              <ul className="reminder-list">
                {panelReminders.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="muted-text" style={{ marginTop: '0.3rem' }}>
              Sesion activa: {sessionUser?.nombre} ({sessionUser?.correo})
            </p>
            <div className="btn-row" style={{ marginTop: '0.7rem' }}>
              <button className="soft-btn" onClick={onLogout}>
                Cerrar sesion
              </button>
            </div>
          </section>

          {activeView === 'inicio' && (
            <section className="grid-cards">
              <article className="panel animate-in stagger-1">
                <h4>{role === 'condomino' ? 'Saldo actual' : 'Pagos por validar hoy'}</h4>
                <p className="big-number">
                  {role === 'condomino' ? `$${saldoActual.toLocaleString('es-MX')}` : pagosPendientesAdminCount}
                </p>
                <button className="primary-btn" onClick={() => onSetView(role === 'condomino' ? 'pagos' : 'validaciones')}>
                  {role === 'condomino' ? 'Ir a pagos' : 'Revisar validaciones'}
                </button>
              </article>

              <article className="panel animate-in stagger-2">
                <h4>{role === 'condomino' ? 'Avisos recientes' : 'Actividad reciente'}</h4>
                <ul className="clean-list">
                  {avisosRecientes.slice(0, 4).map((item) => (
                    <li key={item.id}>
                      <strong>{item.titulo}</strong>
                      <small>{item.fecha}</small>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel animate-in stagger-3">
                <h4>Accion rapida</h4>
                {role === 'condomino' ? (
                  <button className="soft-btn" onClick={() => onSetView('mantenimiento')}>
                    Reportar falla
                  </button>
                ) : (
                  <div className="btn-row">
                    <button className="soft-btn" onClick={() => onSetView('avisos')}>
                      Publicar aviso
                    </button>
                    <button className="soft-btn" onClick={() => onSetView('votaciones')}>
                      Nueva votacion
                    </button>
                  </div>
                )}
                <p className="helper-text">Avisos activos: {panelStats.avisos}.</p>
              </article>

              {role === 'superusuario' && (
                <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
                  <h4>Alta inicial por superusuario</h4>
                  <p className="helper-text" style={{ marginBottom: '0.8rem' }}>
                    Crea condominio, admin y condomino inicial con password temporal.
                  </p>
                  <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.8rem' }}>
                    <div>
                      <label className="field-label">Nombre del condominio</label>
                      <input
                        value={onboardingForm.nombreCondominio}
                        onChange={(event) => onOnboardingFormChange('nombreCondominio', event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Direccion</label>
                      <input
                        value={onboardingForm.direccionCondominio}
                        onChange={(event) => onOnboardingFormChange('direccionCondominio', event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Nombre admin</label>
                      <input value={onboardingForm.nombreAdmin} onChange={(event) => onOnboardingFormChange('nombreAdmin', event.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Apellido admin</label>
                      <input
                        value={onboardingForm.apellidoPaternoAdmin}
                        onChange={(event) => onOnboardingFormChange('apellidoPaternoAdmin', event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Correo admin</label>
                      <input value={onboardingForm.correoAdmin} onChange={(event) => onOnboardingFormChange('correoAdmin', event.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Nombre condomino</label>
                      <input value={onboardingForm.nombreCondomino} onChange={(event) => onOnboardingFormChange('nombreCondomino', event.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Apellido condomino</label>
                      <input
                        value={onboardingForm.apellidoPaternoCondomino}
                        onChange={(event) => onOnboardingFormChange('apellidoPaternoCondomino', event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Correo condomino</label>
                      <input
                        value={onboardingForm.correoCondomino}
                        onChange={(event) => onOnboardingFormChange('correoCondomino', event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="btn-row" style={{ marginTop: '0.9rem' }}>
                    <button className="primary-btn" onClick={onCrearOnboardingInicial}>
                      Crear onboarding inicial
                    </button>
                  </div>
                </article>
              )}
            </section>
          )}

          {role === 'condomino' && activeView === 'pagos' && (
            <section className="panel animate-in">
              <h4>Pagos y cuotas</h4>
              <div className="payment-list">
                {appData.cuotas.map((cuota) => (
                  <article key={cuota.id} className="payment-item">
                    <div>
                      <p className="item-title">{cuota.periodo}</p>
                      <small>
                        Limite: {cuota.fechaLimite} | Recargo: ${cuota.recargo}
                      </small>
                    </div>
                    <p className="item-amount">${cuota.monto.toLocaleString('es-MX')}</p>
                    <span className={`status-pill status-${cuota.status.toLowerCase()}`}>{statusLabel[cuota.status]}</span>
                    <div className="btn-row">
                      <button className="primary-btn" onClick={() => onRegistrarPago(cuota.id)} disabled={cuota.status !== 'PENDIENTE'}>
                        Registrar pago
                      </button>
                      <label className="soft-btn" htmlFor={`comprobante-${cuota.id}`} style={{ cursor: 'pointer' }}>
                        Subir comprobante
                      </label>
                      <input
                        id={`comprobante-${cuota.id}`}
                        type="file"
                        accept="image/*,application/pdf"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            onSubirComprobante(cuota.id, file);
                          }
                          event.currentTarget.value = '';
                        }}
                      />
                      <button
                        className="soft-btn"
                        onClick={() => onDescargarReciboCuota(cuota.id)}
                      >
                        <Icon name="download" />
                        Descargar recibo
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {role !== 'condomino' && activeView === 'validaciones' && (
            <section className="panel animate-in">
              <h4>Validacion de pagos</h4>
              <div className="payment-list">
                {appData.pagos.length === 0 && <p className="empty-state">No hay pagos registrados.</p>}
                {appData.pagos.map((pago) => (
                  <article key={pago.id} className="payment-item">
                    <div>
                      <p className="item-title">Pago #{pago.id}</p>
                      <small>
                        {pago.condominio} | Fecha: {formatShortDate(pago.fecha)}
                      </small>
                    </div>
                    <p className="item-amount">${pago.monto.toLocaleString('es-MX')}</p>
                    <span className={`status-pill status-${pago.status.toLowerCase()}`}>{statusLabel[pago.status]}</span>
                    <div style={{ marginBottom: '0.55rem' }}>
                      <p className="helper-text" style={{ margin: '0 0 0.3rem' }}>
                        Comprobantes: {(evidenciasPorPago[pago.id] ?? []).length}
                      </p>
                      {(evidenciasPorPago[pago.id] ?? []).length > 0 && (
                        <ul className="clean-list" style={{ marginBottom: '0.3rem' }}>
                          {(evidenciasPorPago[pago.id] ?? []).slice(0, 3).map((evidencia) => (
                            <li key={evidencia.idEvidencia}>
                              <a href={evidencia.urlArchivo} target="_blank" rel="noopener noreferrer">
                                {evidencia.nombreArchivo}
                              </a>
                              <small>{formatShortDate(evidencia.fechaCarga)}</small>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="btn-row">
                      <button className="primary-btn" onClick={() => onAprobarPago(pago.id)} disabled={pago.status !== 'PENDIENTE'}>
                        Aprobar pago
                      </button>
                      <button className="soft-btn" onClick={() => onRechazarPago(pago.id)} disabled={pago.status !== 'PENDIENTE'}>
                        Rechazar pago
                      </button>
                      <button className="soft-btn" onClick={() => onGenerarReciboPago(pago.id)}>
                        Generar recibo
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeView === 'avisos' && (
            <section className="grid-cards">
              {role !== 'condomino' && (
                <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
                  <h4>Publicacion rapida</h4>
                  <label className="field-label" htmlFor="aviso-titulo">
                    Titulo del aviso
                  </label>
                  <input
                    id="aviso-titulo"
                    value={avisoTitulo}
                    onChange={(event) => onAvisoTituloChange(event.target.value)}
                    placeholder="Ejemplo: Corte de energia programado"
                  />
                  <label className="field-label" htmlFor="aviso-mensaje">
                    Mensaje
                  </label>
                  <textarea
                    id="aviso-mensaje"
                    rows={4}
                    value={avisoMensaje}
                    onChange={(event) => onAvisoMensajeChange(event.target.value)}
                    placeholder="Describe fecha, hora y recomendaciones para residentes"
                  />
                  <div className="btn-row">
                    <button className="primary-btn" onClick={onPublicarAviso}>
                      Publicar aviso
                    </button>
                  </div>
                </article>
              )}

              <article className="panel animate-in">
                <h4>Avisos</h4>
                <ul className="clean-list">
                  {avisosRecientes.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.titulo}</strong>
                        <p className="helper-text">{item.mensaje}</p>
                      </div>
                      <small>{item.fecha}</small>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel animate-in stagger-1">
                  <h4>{role === 'condomino' ? 'Notificaciones y recordatorios' : 'Notificaciones'}</h4>

                  <label className="field-label" htmlFor="notif-dias-antes">
                    Dias antes del vencimiento
                  </label>
                  <input
                    id="notif-dias-antes"
                    type="number"
                    min={0}
                    value={configNotificaciones.diasAntes}
                    onChange={(event) =>
                      onConfigNotificacionesChange({
                        ...configNotificaciones,
                        diasAntes: Math.max(0, Number(event.target.value || 0)),
                      })
                    }
                  />
                  <label className="field-label" htmlFor="notif-dias-despues">
                    Dias despues del vencimiento
                  </label>
                  <input
                    id="notif-dias-despues"
                    type="number"
                    min={0}
                    value={configNotificaciones.diasDespues}
                    onChange={(event) =>
                      onConfigNotificacionesChange({
                        ...configNotificaciones,
                        diasDespues: Math.max(0, Number(event.target.value || 0)),
                      })
                    }
                  />

                  <div className="btn-row" style={{ marginTop: '0.8rem' }}>
                    <label className="soft-btn" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={configNotificaciones.usarEmail}
                        onChange={(event) =>
                          onConfigNotificacionesChange({
                            ...configNotificaciones,
                            usarEmail: event.target.checked,
                          })
                        }
                      />
                      Email
                    </label>
                    <label className="soft-btn" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={configNotificaciones.usarInterna}
                        onChange={(event) =>
                          onConfigNotificacionesChange({
                            ...configNotificaciones,
                            usarInterna: event.target.checked,
                          })
                        }
                      />
                      Interna
                    </label>
                  </div>

                  <div className="btn-row" style={{ marginTop: '0.8rem' }}>
                    <label className="soft-btn" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={configNotificaciones.activo}
                        onChange={(event) =>
                          onConfigNotificacionesChange({
                            ...configNotificaciones,
                            activo: event.target.checked,
                          })
                        }
                      />
                      Notificaciones activas
                    </label>
                  </div>

                  <div className="btn-row" style={{ marginTop: '0.9rem' }}>
                    <button className="primary-btn" onClick={onGuardarConfigNotificaciones}>
                      Guardar preferencias
                    </button>
                    <button className="soft-btn" onClick={() => onSetView('votaciones')}>
                      Ir a votaciones
                    </button>
                  </div>

                  <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e7d9c6' }} />

                  <h4 style={{ marginBottom: '0.4rem' }}>Bandeja de notificaciones</h4>
                  <ul className="clean-list">
                    {notificacionesRecientes.length === 0 && <li>No hay notificaciones recientes.</li>}
                    {notificacionesRecientes.map((item) => (
                      <li key={item.idNotificacion}>
                        <div>
                          <strong>{item.asunto}</strong>
                          <p className="helper-text">
                            Canal: {item.canal} | Estado: {item.estado}
                          </p>
                          {item.estado !== 'LEIDA' && (
                            <button className="soft-btn" onClick={() => onMarcarNotificacionLeida(item.idNotificacion)}>
                              Marcar como leida
                            </button>
                          )}
                        </div>
                        <small>{formatShortDate(item.fechaProgramada)}</small>
                      </li>
                    ))}
                  </ul>
                </article>
            </section>
          )}

          {activeView === 'votaciones' && (
            <section className="grid-cards">
              {role !== 'condomino' && (
                <article className="panel animate-in">
                  <h4>Crear votacion</h4>
                  <label className="field-label" htmlFor="votacion-pregunta">
                    Pregunta a votar
                  </label>
                  <textarea
                    id="votacion-pregunta"
                    rows={4}
                    value={votacionPregunta}
                    onChange={(event) => onVotacionPreguntaChange(event.target.value)}
                    placeholder="Ejemplo: Aprobar presupuesto para impermeabilizacion del edificio A"
                  />
                  <div className="btn-row">
                    <button className="primary-btn" onClick={onCrearVotacion}>
                      Publicar votacion
                    </button>
                  </div>

                  <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e7d9c6' }} />

                  <h4>Votacion especial: cambio de cuota</h4>
                  {votacionCambioCuotaEnCurso ? (
                    <article className="payment-item" style={{ marginTop: '0.5rem' }}>
                      <p className="item-title">Votacion #{votacionCambioCuotaEnCurso.id} en curso</p>
                      <p className="helper-text">{votacionCambioCuotaEnCurso.pregunta}</p>
                      {votacionCambioCuotaEnCurso.cambioCuota && (
                        <p className="helper-text" style={{ marginBottom: '0.4rem' }}>
                          Monto: ${votacionCambioCuotaEnCurso.cambioCuota.montoPropuesto.toLocaleString('es-MX')} | Recargo: ${votacionCambioCuotaEnCurso.cambioCuota.recargoPropuesto.toLocaleString('es-MX')} | Dia limite: {votacionCambioCuotaEnCurso.cambioCuota.diaLimitePropuesto} | Periodo: {votacionCambioCuotaEnCurso.cambioCuota.periodoAplicacion}
                        </p>
                      )}
                      <div className="stats-row">
                        <span className="status-pill status-aprobado">A favor: {votacionCambioCuotaEnCurso.aFavor}</span>
                        <span className="status-pill status-rechazado">En contra: {votacionCambioCuotaEnCurso.enContra}</span>
                        <span className="status-pill status-en_proceso">
                          {votacionCambioCuotaEnCurso.cambioCuota?.estadoPropuesta ?? 'PENDIENTE'}
                        </span>
                      </div>
                    </article>
                  ) : (
                    <>
                      <label className="field-label" htmlFor="cuota-monto-propuesto">
                        Nuevo monto mensual
                      </label>
                      <input
                        id="cuota-monto-propuesto"
                        type="number"
                        min={1}
                        value={cuotaCambioForm.montoPropuesto}
                        onChange={(event) =>
                          onCuotaCambioFormChange({
                            ...cuotaCambioForm,
                            montoPropuesto: event.target.value,
                          })
                        }
                        placeholder="Ejemplo: 1800"
                      />
                      <label className="field-label" htmlFor="cuota-recargo-propuesto">
                        Recargo por dia
                      </label>
                      <input
                        id="cuota-recargo-propuesto"
                        type="number"
                        min={0}
                        value={cuotaCambioForm.recargoPropuesto}
                        onChange={(event) =>
                          onCuotaCambioFormChange({
                            ...cuotaCambioForm,
                            recargoPropuesto: event.target.value,
                          })
                        }
                        placeholder="Ejemplo: 50"
                      />
                      <label className="field-label" htmlFor="cuota-dia-limite-propuesto">
                        Dia limite de pago (1 a 28)
                      </label>
                      <input
                        id="cuota-dia-limite-propuesto"
                        type="number"
                        min={1}
                        max={28}
                        value={cuotaCambioForm.diaLimitePropuesto}
                        onChange={(event) =>
                          onCuotaCambioFormChange({
                            ...cuotaCambioForm,
                            diaLimitePropuesto: event.target.value,
                          })
                        }
                      />
                      <label className="field-label" htmlFor="cuota-motivo-propuesto">
                        Motivo del cambio
                      </label>
                      <textarea
                        id="cuota-motivo-propuesto"
                        rows={3}
                        value={cuotaCambioForm.motivo}
                        onChange={(event) =>
                          onCuotaCambioFormChange({
                            ...cuotaCambioForm,
                            motivo: event.target.value,
                          })
                        }
                        placeholder="Explica por que es necesario ajustar la cuota"
                      />
                      <div className="btn-row">
                        <button className="primary-btn" onClick={onCrearVotacionCambioCuota}>
                          Publicar votacion de cuota
                        </button>
                      </div>
                    </>
                  )}
                </article>
              )}

              <article className={`panel animate-in ${role !== 'condomino' ? 'stagger-1' : ''}`}>
                <h4>{role === 'condomino' ? 'Votaciones activas' : 'Administrar votaciones activas'}</h4>
                <div className="payment-list">
                  {votacionesGeneralesActivas.length === 0 && <p className="empty-state">No hay votaciones activas para este condominio.</p>}
                  {votacionesGeneralesActivas.map((votacion) => {
                    const votoUsuario = sessionUser ? votacion.votosPorUsuario[sessionUser.correo] : undefined;

                    return (
                      <article key={votacion.id} className="payment-item">
                        <p className="item-title">Votacion #{votacion.id}</p>
                        <p className="helper-text" style={{ marginBottom: '0.55rem' }}>
                          {votacion.pregunta}
                        </p>
                        <div className="stats-row">
                          <span className="status-pill status-aprobado">A favor: {votacion.aFavor}</span>
                          <span className="status-pill status-rechazado">En contra: {votacion.enContra}</span>
                        </div>

                        {role === 'condomino' ? (
                          <div className="btn-row">
                            <button className="primary-btn" onClick={() => onVotar(votacion.id, 'favor')} disabled={Boolean(votoUsuario)}>
                              Votar a favor
                            </button>
                            <button className="soft-btn" onClick={() => onVotar(votacion.id, 'contra')} disabled={Boolean(votoUsuario)}>
                              Votar en contra
                            </button>
                            {votoUsuario && <p className="helper-text">Tu voto ya fue registrado: {votoUsuario}.</p>}
                          </div>
                        ) : (
                          <div className="btn-row">
                            <button className="soft-btn" onClick={() => onCerrarVotacion(votacion.id)}>
                              Cerrar votacion
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </article>

              {role === 'condomino' && (
                <article className="panel animate-in stagger-1">
                  <h4>Prioridad: cambios de cuota</h4>
                  <div className="payment-list">
                    {votacionesEspecialesActivas.length === 0 && (
                      <p className="empty-state">No hay votaciones especiales de cuota activas.</p>
                    )}
                    {votacionesEspecialesActivas.map((votacion) => {
                      const votoUsuario = sessionUser ? votacion.votosPorUsuario[sessionUser.correo] : undefined;
                      return (
                        <article key={votacion.id} className="payment-item">
                          <p className="item-title">Votacion especial #{votacion.id}</p>
                          <p className="helper-text">{votacion.pregunta}</p>
                          {votacion.cambioCuota && (
                            <p className="helper-text" style={{ marginBottom: '0.4rem' }}>
                              Nuevo monto: ${votacion.cambioCuota.montoPropuesto.toLocaleString('es-MX')} | Recargo: ${votacion.cambioCuota.recargoPropuesto.toLocaleString('es-MX')} | Dia limite: {votacion.cambioCuota.diaLimitePropuesto} | Aplica: {votacion.cambioCuota.periodoAplicacion}
                            </p>
                          )}
                          <div className="stats-row">
                            <span className="status-pill status-aprobado">A favor: {votacion.aFavor}</span>
                            <span className="status-pill status-rechazado">En contra: {votacion.enContra}</span>
                          </div>
                          <div className="btn-row">
                            <button className="primary-btn" onClick={() => onVotar(votacion.id, 'favor')} disabled={Boolean(votoUsuario)}>
                              Votar a favor
                            </button>
                            <button className="soft-btn" onClick={() => onVotar(votacion.id, 'contra')} disabled={Boolean(votoUsuario)}>
                              Votar en contra
                            </button>
                            {votoUsuario && <p className="helper-text">Tu voto ya fue registrado: {votoUsuario}.</p>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>
              )}
            </section>
          )}

          {activeView === 'mantenimiento' && (
            <section className="panel animate-in">
              <h4>{role === 'condomino' ? 'Reportar falla' : 'Seguimiento de mantenimiento'}</h4>
              {role === 'condomino' ? (
                <div className="mantenimiento-condomino-grid">
                  <article className="panel-subsection">
                    <h5>Redactar incidencia</h5>
                    <label className="field-label" htmlFor="falla-descripcion">
                      Describe la incidencia
                    </label>
                    <textarea
                      id="falla-descripcion"
                      value={falla}
                      onChange={(event) => onFallaChange(event.target.value)}
                      placeholder="Ejemplo: fuga en pasillo del edificio B"
                      rows={4}
                    />
                    <div className="btn-row">
                      <button className="primary-btn" onClick={onEnviarReporteMantenimiento} disabled={!falla.trim()}>
                        Enviar reporte
                      </button>
                    </div>
                  </article>

                  <article className="panel-subsection">
                    <h5>Tus reportes de fallas</h5>
                    {misReportesMantenimiento.length === 0 && (
                      <p className="empty-state">Aun no has reportado fallas en este condominio.</p>
                    )}
                    <div className="payment-list">
                      {misReportesMantenimiento.map((reporte) => (
                        <article key={reporte.id} className="payment-item compact-item">
                          <p className="item-title">Reporte #{reporte.id}</p>
                          <small>
                            {reporte.unidad} | {reporte.fecha}
                          </small>
                          <span className={`status-pill status-${reporte.estado.toLowerCase()}`}>
                            {statusLabel[reporte.estado]}
                          </span>
                          <p className="helper-text">{reporte.descripcion}</p>
                        </article>
                      ))}
                    </div>
                  </article>
                </div>
              ) : (
                <div className="payment-list">
                  {appData.mantenimientos.map((reporte) => (
                    <article key={reporte.id} className="payment-item">
                      <p className="item-title">
                        Reporte #{reporte.id} | {reporte.unidad}
                      </p>
                      <small>
                        {reporte.descripcion} | {reporte.fecha}
                      </small>
                      <span className={`status-pill status-${reporte.estado.toLowerCase()}`}>{statusLabel[reporte.estado]}</span>
                      <div className="btn-row">
                        <button
                          className="soft-btn"
                          onClick={() => onActualizarEstadoMantenimiento(reporte.id, 'EN_PROCESO')}
                          disabled={reporte.estado === 'EN_PROCESO'}
                        >
                          Marcar en proceso
                        </button>
                        <button
                          className="primary-btn"
                          onClick={() => onActualizarEstadoMantenimiento(reporte.id, 'RESUELTO')}
                          disabled={reporte.estado === 'RESUELTO'}
                        >
                          Marcar resuelto
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {role === 'condomino' && activeView === 'reportes' && (
            <section className="panel animate-in">
              <h4>Reportes financieros</h4>
              <p className="helper-text" style={{ marginBottom: '0.8rem' }}>
                Selecciona los periodos directamente en la tabla. Si no seleccionas ninguno, se exportan todos.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sel.</th>
                      <th>Periodo</th>
                      <th>Ingresos</th>
                      <th>Gastos</th>
                      <th>Adeudos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appData.reportes.map((row) => (
                      <tr key={row.periodo}>
                        <td>
                          <button
                            className={`period-toggle ${periodosSeleccionados.includes(row.periodo) ? 'active' : ''}`}
                            onClick={() => onAlternarPeriodoReporte(row.periodo)}
                            type="button"
                          >
                            {periodosSeleccionados.includes(row.periodo) ? 'Seleccionado' : 'Seleccionar'}
                          </button>
                        </td>
                        <td>{row.periodo}</td>
                        <td>${row.ingresos.toLocaleString('es-MX')}</td>
                        <td>${row.gastos.toLocaleString('es-MX')}</td>
                        <td>${row.adeudos.toLocaleString('es-MX')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="btn-row">
                <button className="soft-btn" onClick={onDescargarReportePdf}>
                  <Icon name="download" />
                  Descargar PDF
                </button>
                <button className="soft-btn" onClick={onDescargarReporteExcel}>
                  <Icon name="download" />
                  Descargar Excel
                </button>
              </div>
            </section>
          )}

          {activeView === 'perfil' && (
            <section className="grid-cards">
              <article className="panel animate-in">
                <h4>Datos personales</h4>
                <div className="readonly-profile-grid">
                  <div className="readonly-field">
                    <span>Nombre</span>
                    <strong>{sessionUser?.nombre ?? 'Sin dato'}</strong>
                  </div>
                  <div className="readonly-field">
                    <span>Correo</span>
                    <strong>{sessionUser?.correo ?? 'Sin dato'}</strong>
                  </div>
                  <div className="readonly-field">
                    <span>Rol</span>
                    <strong>{role === 'condomino' ? 'Condomino' : 'Administrador'}</strong>
                  </div>
                  <div className="readonly-field">
                    <span>Condominios donde participas</span>
                    <strong>
                      {condominiosDisponibles.length > 0
                        ? condominiosDisponibles.map((item) => item.nombre).join(', ')
                        : 'Sin condominios activos'}
                    </strong>
                  </div>
                </div>

                <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e7d9c6' }} />

                <label className="field-label" htmlFor="perfil-correo">
                  Correo
                </label>
                <input
                  id="perfil-correo"
                  value={perfil.correo}
                  onChange={(event) =>
                    onPerfilChange({
                      ...perfil,
                      correo: event.target.value,
                    })
                  }
                  placeholder="correo@dominio.com"
                />
                <div className="btn-row" style={{ marginTop: '0.8rem' }}>
                  <button className="primary-btn" onClick={onActualizarCorreoPerfil}>
                    Guardar correo
                  </button>
                </div>

                <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e7d9c6' }} />

                <label className="field-label" htmlFor="perfil-password-actual">
                  Password actual
                </label>
                <input
                  id="perfil-password-actual"
                  type="password"
                  value={perfil.passwordActual}
                  onChange={(event) =>
                    onPerfilChange({
                      ...perfil,
                      passwordActual: event.target.value,
                    })
                  }
                  placeholder="******"
                />
                <label className="field-label" htmlFor="perfil-password-nueva">
                  Password nueva
                </label>
                <input
                  id="perfil-password-nueva"
                  type="password"
                  value={perfil.passwordNueva}
                  onChange={(event) =>
                    onPerfilChange({
                      ...perfil,
                      passwordNueva: event.target.value,
                    })
                  }
                  placeholder="Minimo 8 caracteres"
                />
                <div className="btn-row" style={{ marginTop: '0.8rem' }}>
                  <button className="soft-btn" onClick={onActualizarPasswordPerfil}>
                    Actualizar password
                  </button>
                </div>
              </article>

              {role === 'condomino' && (
                <article className="panel animate-in stagger-1">
                  <h4>Solicitud de baja o cambio</h4>
                  <p className="helper-text" style={{ marginBottom: '0.7rem' }}>
                    El cambio no se aplica automaticamente: debe ser aprobado por un administrador.
                  </p>
                  <label className="field-label" htmlFor="solicitud-tipo">
                    Tipo de solicitud
                  </label>
                  <select
                    id="solicitud-tipo"
                    className="condominio-switcher-select solicitud-select"
                    value={solicitudForm.tipo}
                    onChange={(event) =>
                      onSolicitudFormChange({
                        ...solicitudForm,
                        tipo: event.target.value === 'CAMBIO_UNIDAD' ? 'CAMBIO_UNIDAD' : 'BAJA_CONDOMINO',
                      })
                    }
                  >
                    <option value="BAJA_CONDOMINO">Baja de condominio</option>
                    <option value="CAMBIO_UNIDAD">Cambio de unidad</option>
                  </select>

                  {solicitudForm.tipo === 'CAMBIO_UNIDAD' && (
                    <>
                      <label className="field-label" htmlFor="solicitud-unidad">
                        ID de unidad destino
                      </label>
                      <input
                        id="solicitud-unidad"
                        type="number"
                        value={solicitudForm.idUnidadDestino}
                        onChange={(event) =>
                          onSolicitudFormChange({
                            ...solicitudForm,
                            idUnidadDestino: event.target.value,
                          })
                        }
                        placeholder="Ejemplo: 101"
                      />
                    </>
                  )}

                  <label className="field-label" htmlFor="solicitud-motivo">
                    Motivo
                  </label>
                  <textarea
                    id="solicitud-motivo"
                    rows={4}
                    value={solicitudForm.motivo}
                    onChange={(event) =>
                      onSolicitudFormChange({
                        ...solicitudForm,
                        motivo: event.target.value,
                      })
                    }
                    placeholder="Describe brevemente la razon"
                  />

                  <div className="btn-row" style={{ marginTop: '0.8rem' }}>
                    <button className="primary-btn" onClick={onCrearSolicitudCambio}>
                      Enviar solicitud al admin
                    </button>
                  </div>

                  <div className="profile-track-block">
                    <h5>Seguimiento de tus solicitudes</h5>
                    {solicitudesCambio.length === 0 && (
                      <p className="empty-state">Aun no has creado solicitudes de baja o cambio.</p>
                    )}
                    <div className="payment-list">
                      {solicitudesCambio.map((item) => (
                        <article key={item.idSolicitud} className="payment-item compact-item">
                          <p className="item-title">
                            #{item.idSolicitud} - {solicitudTipoLabel(item.tipo)}
                          </p>
                          <small>Creada: {formatShortDate(item.fechaSolicitud)}</small>
                          <span className={`status-pill status-${item.estado.toLowerCase()}`}>
                            {solicitudEstadoLabel(item.estado)}
                          </span>
                          <p className="helper-text">{item.motivo}</p>
                          {item.detalle && <p className="helper-text">{formatSolicitudDetalle(item.detalle)}</p>}
                        </article>
                      ))}
                    </div>
                  </div>
                </article>
              )}
            </section>
          )}

          {role !== 'condomino' && activeView === 'solicitudes' && (
            <section className="panel animate-in">
              <div className="super-block-header">
                <h4>Bajas y cambios</h4>
                <button className="soft-btn" onClick={onRefreshSolicitudesCambio}>
                  Actualizar
                </button>
              </div>

              <div className="payment-list">
                {solicitudesCambio.length === 0 && <p className="empty-state">No hay solicitudes registradas.</p>}
                {solicitudesCambio.map((item) => (
                  <article key={item.idSolicitud} className="payment-item">
                    <div>
                      <p className="item-title">
                        Solicitud #{item.idSolicitud} - {solicitudTipoLabel(item.tipo)}
                      </p>
                      <small>
                        Solicitante: {item.idUsuarioCondominioSolicitante} | Objetivo: {item.idUsuarioCondominioObjetivo}
                      </small>
                      <p className="helper-text" style={{ marginTop: '0.35rem' }}>
                        {item.motivo}
                      </p>
                      {item.detalle && (
                        <p className="helper-text">Detalle: {formatSolicitudDetalle(item.detalle)}</p>
                      )}
                    </div>
                    <span className={`status-pill status-${item.estado.toLowerCase()}`}>{solicitudEstadoLabel(item.estado)}</span>
                    <div className="btn-row">
                      <button className="primary-btn" onClick={() => onResolverSolicitudCambio(item.idSolicitud, 'aprobar')} disabled={item.estado !== 'PENDIENTE'}>
                        Aprobar
                      </button>
                      <button className="soft-btn" onClick={() => onResolverSolicitudCambio(item.idSolicitud, 'rechazar')} disabled={item.estado !== 'PENDIENTE'}>
                        Rechazar
                      </button>
                      <button className="soft-btn" onClick={() => onResolverSolicitudCambio(item.idSolicitud, 'ejecutar')} disabled={item.estado !== 'APROBADA'}>
                        Ejecutar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {role !== 'condomino' && activeView === 'finanzas' && (
            <section className="grid-cards">
              <article className="panel animate-in">
                <h4>Registrar gasto</h4>
                <label className="field-label" htmlFor="gasto-concepto">
                  Concepto
                </label>
                <input
                  id="gasto-concepto"
                  value={gastoConcepto}
                  onChange={(event) => onGastoConceptoChange(event.target.value)}
                  placeholder="Ejemplo: Reparacion de porton"
                />
                <label className="field-label" htmlFor="gasto-categoria">
                  Categoria
                </label>
                <input
                  id="gasto-categoria"
                  value={gastoCategoria}
                  onChange={(event) => onGastoCategoriaChange(event.target.value)}
                  placeholder="Mantenimiento, Servicios, Seguridad..."
                />
                <label className="field-label" htmlFor="gasto-monto">
                  Monto
                </label>
                <input
                  id="gasto-monto"
                  type="number"
                  value={gastoMonto}
                  onChange={(event) => onGastoMontoChange(event.target.value)}
                  placeholder="0"
                />
                <div className="btn-row">
                  <button className="primary-btn" onClick={onRegistrarGasto}>
                    Nuevo gasto
                  </button>
                </div>
              </article>

              <article className="panel animate-in stagger-1">
                <h4>Gastos recientes</h4>
                <ul className="clean-list">
                  {gastosRecientes.map((gasto) => (
                    <li key={gasto.id}>
                      <div>
                        <strong>{gasto.concepto}</strong>
                        <p className="helper-text">{gasto.categoria}</p>
                      </div>
                      <small>${gasto.monto.toLocaleString('es-MX')}</small>
                    </li>
                  ))}
                </ul>
                <p className="big-number">${balanceMensual.toLocaleString('es-MX')}</p>
                <small className="muted-text">Balance estimado del ultimo reporte</small>
                <div className="btn-row" style={{ marginTop: '0.7rem' }}>
                  <button className="soft-btn" onClick={onGenerarReporteFinanzas}>
                    Generar reporte
                  </button>
                  <button className="soft-btn" onClick={onExportarExcelFinanzas}>
                    <Icon name="download" />
                    Exportar Excel
                  </button>
                </div>
              </article>
            </section>
          )}
        </main>

        {loadingLabel && (
          <div className="loading-pill" role="status">
            <span className="spinner" />
            {loadingLabel}
          </div>
        )}

        {feedback && (
          <div className="feedback-pill" role="status">
            <Icon name="check" />
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}
