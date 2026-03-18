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
  falla: string;
  avisoTitulo: string;
  avisoMensaje: string;
  votacionPregunta: string;
  gastoConcepto: string;
  gastoCategoria: string;
  gastoMonto: string;
  loadingLabel: string | null;
  feedback: string | null;
  onToggleMenu: () => void;
  onChangeCondominio: (condominioId: number) => void;
  onCloseMenu: () => void;
  onSetView: (view: ViewKey) => void;
  onLogout: () => void;
  onRegistrarPago: (cuotaId: number) => void;
  onAprobarPago: (idPago: number) => void;
  onRechazarPago: (idPago: number) => void;
  onVotar: (votacionId: number, choice: VoteChoice) => void;
  onCrearVotacion: () => void;
  onCerrarVotacion: (votacionId: number) => void;
  onPublicarAviso: () => void;
  onFallaChange: (value: string) => void;
  onAvisoTituloChange: (value: string) => void;
  onAvisoMensajeChange: (value: string) => void;
  onVotacionPreguntaChange: (value: string) => void;
  onEnviarReporteMantenimiento: () => void;
  onActualizarEstadoMantenimiento: (id: number, estado: MantenimientoStatus) => void;
  onGastoConceptoChange: (value: string) => void;
  onGastoCategoriaChange: (value: string) => void;
  onGastoMontoChange: (value: string) => void;
  onRegistrarGasto: () => void;
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
  falla,
  avisoTitulo,
  avisoMensaje,
  votacionPregunta,
  gastoConcepto,
  gastoCategoria,
  gastoMonto,
  loadingLabel,
  feedback,
  onToggleMenu,
  onChangeCondominio,
  onCloseMenu,
  onSetView,
  onLogout,
  onRegistrarPago,
  onAprobarPago,
  onRechazarPago,
  onVotar,
  onCrearVotacion,
  onCerrarVotacion,
  onPublicarAviso,
  onFallaChange,
  onAvisoTituloChange,
  onAvisoMensajeChange,
  onVotacionPreguntaChange,
  onEnviarReporteMantenimiento,
  onActualizarEstadoMantenimiento,
  onGastoConceptoChange,
  onGastoCategoriaChange,
  onGastoMontoChange,
  onRegistrarGasto,
  onRunAction,
  formatShortDate,
}: DashboardPageProps) {
  const quickViewButtons =
    role === 'condomino'
      ? ([
          { key: 'pagos' as ViewKey, label: 'Pagos' },
          { key: 'avisos' as ViewKey, label: 'Avisos' },
          { key: 'votaciones' as ViewKey, label: 'Votaciones' },
          { key: 'mantenimiento' as ViewKey, label: 'Mantenimiento' },
          { key: 'reportes' as ViewKey, label: 'Reportes' },
        ] as const)
      : ([
          { key: 'validaciones' as ViewKey, label: 'Validaciones' },
          { key: 'avisos' as ViewKey, label: 'Avisos' },
          { key: 'votaciones' as ViewKey, label: 'Votaciones' },
          { key: 'finanzas' as ViewKey, label: 'Reportes' },
        ] as const);

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
                      <button className="soft-btn" onClick={() => onRunAction('Subiendo comprobante...', 'Comprobante cargado correctamente')}>
                        Subir comprobante
                      </button>
                      <button
                        className="soft-btn"
                        onClick={() => onRunAction('Generando recibo...', 'Recibo PDF generado y listo para descarga')}
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

          {role === 'administrador' && activeView === 'validaciones' && (
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
                    <div className="btn-row">
                      <button className="primary-btn" onClick={() => onAprobarPago(pago.id)} disabled={pago.status !== 'PENDIENTE'}>
                        Aprobar pago
                      </button>
                      <button className="soft-btn" onClick={() => onRechazarPago(pago.id)} disabled={pago.status !== 'PENDIENTE'}>
                        Rechazar pago
                      </button>
                      <button className="soft-btn" onClick={() => onRunAction('Generando recibo...', 'Recibo generado y enviado')}>
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
              <article className="panel animate-in">
                <h4>{role === 'condomino' ? 'Avisos' : 'Administrar avisos'}</h4>
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
                <h4>Publicacion rapida</h4>
                <label className="field-label" htmlFor="aviso-titulo">
                  Titulo del aviso
                </label>
                <input
                  id="aviso-titulo"
                  value={avisoTitulo}
                  onChange={(event) => onAvisoTituloChange(event.target.value)}
                  placeholder="Ejemplo: Corte de energia programado"
                  disabled={role !== 'administrador'}
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
                  disabled={role !== 'administrador'}
                />
                <div className="btn-row">
                  <button className="primary-btn" onClick={onPublicarAviso} disabled={role !== 'administrador'}>
                    Publicar aviso
                  </button>
                  {role === 'condomino' && (
                    <button className="soft-btn" onClick={() => onSetView('votaciones')}>
                      Ir a votaciones
                    </button>
                  )}
                </div>
                {role === 'condomino' && (
                  <p className="helper-text">Solo administracion puede crear avisos. Aqui puedes consultar los publicados.</p>
                )}
              </article>
            </section>
          )}

          {activeView === 'votaciones' && (
            <section className="grid-cards">
              {role === 'administrador' && (
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
                </article>
              )}

              <article className={`panel animate-in ${role === 'administrador' ? 'stagger-1' : ''}`}>
                <h4>{role === 'condomino' ? 'Votaciones activas' : 'Administrar votaciones activas'}</h4>
                <div className="payment-list">
                  {votacionesActivas.length === 0 && <p className="empty-state">No hay votaciones activas para este condominio.</p>}
                  {votacionesActivas.map((votacion) => {
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
            </section>
          )}

          {activeView === 'mantenimiento' && (
            <section className="panel animate-in">
              <h4>{role === 'condomino' ? 'Reportar falla' : 'Seguimiento de mantenimiento'}</h4>
              {role === 'condomino' ? (
                <>
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
                </>
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
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th>Ingresos</th>
                      <th>Gastos</th>
                      <th>Adeudos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appData.reportes.map((row) => (
                      <tr key={row.periodo}>
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
                <button className="soft-btn" onClick={() => onRunAction('Exportando PDF...', 'Reporte PDF descargado')}>
                  <Icon name="download" />
                  Descargar PDF
                </button>
                <button className="soft-btn" onClick={() => onRunAction('Exportando Excel...', 'Reporte Excel descargado')}>
                  <Icon name="download" />
                  Descargar Excel
                </button>
              </div>
            </section>
          )}

          {role === 'administrador' && activeView === 'finanzas' && (
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
                <small className="muted-text">Balance estimado acumulado</small>
                <div className="btn-row" style={{ marginTop: '0.7rem' }}>
                  <button className="soft-btn" onClick={() => onRunAction('Generando reporte...', 'Reporte financiero generado')}>
                    Generar reporte
                  </button>
                  <button className="soft-btn" onClick={() => onRunAction('Exportando Excel...', 'Excel descargado')}>
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
