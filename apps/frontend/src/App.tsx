import { useMemo, useState } from 'react';

type RoleKey = 'condomino' | 'administrador';
type ViewKey =
  | 'inicio'
  | 'pagos'
  | 'avisos'
  | 'mantenimiento'
  | 'reportes'
  | 'validaciones'
  | 'finanzas';

type NavItem = {
  key: ViewKey;
  label: string;
  icon: IconName;
};

type DemoUser = {
  correo: string;
  password: string;
  role: RoleKey;
  nombre: string;
};

type IconName =
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

const navCondomino: NavItem[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'pagos', label: 'Pagos', icon: 'payments' },
  { key: 'avisos', label: 'Avisos y votaciones', icon: 'megaphone' },
  { key: 'mantenimiento', label: 'Mantenimiento', icon: 'tools' },
  { key: 'reportes', label: 'Reportes', icon: 'report' },
];

const navAdministrador: NavItem[] = [
  { key: 'inicio', label: 'Panel admin', icon: 'users' },
  { key: 'validaciones', label: 'Validar pagos', icon: 'approve' },
  { key: 'avisos', label: 'Avisos y votaciones', icon: 'megaphone' },
  { key: 'mantenimiento', label: 'Reportes mantenimiento', icon: 'tools' },
  { key: 'finanzas', label: 'Gastos y reportes', icon: 'money' },
];

const cuotasPendientes = [
  { periodo: 'Marzo 2026', monto: 1850, fechaLimite: '2026-03-20', recargo: 50 },
  { periodo: 'Abril 2026', monto: 1850, fechaLimite: '2026-04-20', recargo: 0 },
];

const avisos = [
  { id: 1, titulo: 'Mantenimiento de cisterna', fecha: '13 Mar 2026' },
  { id: 2, titulo: 'Asamblea extraordinaria', fecha: '18 Mar 2026' },
];

const reportes = [
  { periodo: 'Enero 2026', ingresos: 92500, gastos: 23300, adeudos: 10400 },
  { periodo: 'Febrero 2026', ingresos: 91150, gastos: 27500, adeudos: 12200 },
];

const pagosPendientesAdmin = [
  { idPago: 2421, condominio: 'Depto A-302', monto: 1850, fecha: '16 Mar 2026' },
  { idPago: 2422, condominio: 'Depto C-101', monto: 1850, fecha: '16 Mar 2026' },
];

const gastosRecientes = [
  { concepto: 'Jardineria', categoria: 'Servicios', monto: 5400 },
  { concepto: 'Mantenimiento elevador', categoria: 'Mantenimiento', monto: 9100 },
];

const demoUsers: DemoUser[] = [
  {
    correo: 'condomino@elyx.mx',
    password: 'Elyx123',
    role: 'condomino',
    nombre: 'Condomino Torre Norte',
  },
  {
    correo: 'admin@elyx.mx',
    password: 'Elyx123',
    role: 'administrador',
    nombre: 'Administrador General',
  },
];

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: 'M3 11.5L12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    payments: 'M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 3h18M7 15h3',
    megaphone: 'M3 10v4h4l6 4V6l-6 4zm10-2h3m0 0l4-2m-4 2l4 2',
    tools: 'M21 3l-6 6m-2 2l-8 8m7-12l3 3m-5 5l3 3M8 4a4 4 0 0 0 4 4',
    report: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h8',
    approve: 'M4 12l5 5L20 6M3 4h18M3 20h18',
    money: 'M12 2v20M6 7c0-2 2-3 6-3s6 1 6 3-2 3-6 3-6 1-6 3 2 3 6 3 6-1 6-3',
    users: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM6 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM2 20a4 4 0 0 1 8 0m2 0a5 5 0 0 1 10 0',
    menu: 'M3 6h18M3 12h18M3 18h18',
    close: 'M5 5l14 14M19 5L5 19',
    download: 'M12 3v11m0 0l-4-4m4 4l4-4M5 20h14',
    check: 'M4 12l5 5L20 6',
  };

  return (
    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<RoleKey>('condomino');
  const [sessionUser, setSessionUser] = useState<DemoUser | null>(null);
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('inicio');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [falla, setFalla] = useState('');

  const saldoActual = useMemo(() => {
    return cuotasPendientes.reduce((acc, cuota) => acc + cuota.monto + cuota.recargo, 0);
  }, []);

  const navItems = role === 'condomino' ? navCondomino : navAdministrador;

  const runAction = (loading: string, success: string) => {
    setLoadingLabel(loading);
    window.setTimeout(() => {
      setLoadingLabel(null);
      setFeedback(success);
      window.setTimeout(() => setFeedback(null), 2200);
    }, 1100);
  };

  const closeMobileMenu = () => setMenuOpen(false);

  const handleLogin = () => {
    const correoNormalizado = correo.trim().toLowerCase();
    const matchedUser = demoUsers.find((user) => user.correo === correoNormalizado && user.password === password);

    if (!matchedUser) {
      setLoginError('Credenciales no validas. Revisa correo y contrasena.');
      return;
    }

    setLoginError(null);
    runAction('Iniciando sesion...', 'Bienvenido a Elyx');
    window.setTimeout(() => {
      setRole(matchedUser.role);
      setSessionUser(matchedUser);
      setActiveView('inicio');
      setIsAuthenticated(true);
      setMenuOpen(false);
    }, 600);
  };

  if (!isAuthenticated) {
    return (
      <div className="app-bg login-bg">
        <section className="login-shell animate-in">
          <div className="login-brand">
            <p className="brand-kicker">Plataforma condominal</p>
            <h1>Elyx</h1>
            <p><strong>Finanzas condominales claras y sin papeles</strong></p>
            <p>Accede para consultar pagos, reportes y comunicacion interna.</p>
          </div>

          <article className="login-card">
            <h2>Iniciar sesion</h2>

            <label className="field-label" htmlFor="correo-login">
              Correo
            </label>
            <input
              id="correo-login"
              type="email"
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
              placeholder="usuario@elyx.mx"
            />

            <label className="field-label" htmlFor="password-login">
              Contrasena
            </label>
            <input
              id="password-login"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
            />

            <div className="login-hint">
              <p>Usuarios de prueba (mockup):</p>
              <ul className="hint-list">
                <li>condomino@elyx.mx / Elyx123</li>
                <li>admin@elyx.mx / Elyx123</li>
              </ul>
            </div>

            {loginError && <p className="login-error">{loginError}</p>}

            <button className="primary-btn login-btn" type="button" onClick={handleLogin}>
              Entrar
            </button>
          </article>
        </section>

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
    );
  }

  return (
    <div className="app-bg">
      <div className="app-shell">
        <header className="mobile-bar">
          <h1>Elyx</h1>
          <button className="icon-btn" onClick={() => setMenuOpen((prev) => !prev)} aria-label="Abrir menu">
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </header>

        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="brand-block">
            <p className="brand-kicker">Plataforma condominal</p>
            <h2>Elyx</h2>
            <p><strong>Finanzas condominales claras y sin papeles</strong></p>
            <p>Consulta, pago y comunicacion interna en pocos pasos.</p>
          </div>

          <nav>
            {navItems.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${activeView === item.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveView(item.key);
                  closeMobileMenu();
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
          onClick={closeMobileMenu}
          type="button"
        />

        <main className="content">
          <section className="welcome-card animate-in">
            <h3>{role === 'condomino' ? 'Panel de Condominio' : 'Panel de Administrador'}</h3>
            <p>
              {role === 'condomino'
                ? 'Flujos esenciales en maximo 3 clics: pagar, consultar estado y descargar comprobantes.'
                : 'Gestion centralizada para validar pagos, publicar avisos y generar reportes financieros.'}
            </p>
            <p className="muted-text" style={{ marginTop: '0.3rem' }}>
              Sesion activa: {sessionUser?.nombre} ({sessionUser?.correo})
            </p>
            <div className="btn-row" style={{ marginTop: '0.7rem' }}>
              <button
                className="soft-btn"
                onClick={() => {
                  setIsAuthenticated(false);
                  setSessionUser(null);
                  setCorreo('');
                  setPassword('');
                  setLoginError(null);
                }}
              >
                Cerrar sesion
              </button>
            </div>
          </section>

          {activeView === 'inicio' && (
            <section className="grid-cards">
              <article className="panel animate-in stagger-1">
                <h4>{role === 'condomino' ? 'Saldo actual' : 'Pagos por validar hoy'}</h4>
                <p className="big-number">
                  {role === 'condomino' ? `$${saldoActual.toLocaleString('es-MX')}` : pagosPendientesAdmin.length}
                </p>
                <button className="primary-btn" onClick={() => setActiveView(role === 'condomino' ? 'pagos' : 'validaciones')}>
                  {role === 'condomino' ? 'Ir a pagos' : 'Revisar validaciones'}
                </button>
              </article>

              <article className="panel animate-in stagger-2">
                <h4>{role === 'condomino' ? 'Avisos recientes' : 'Actividad reciente'}</h4>
                <ul className="clean-list">
                  {avisos.map((item) => (
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
                  <button className="soft-btn" onClick={() => setActiveView('mantenimiento')}>
                    Reportar falla
                  </button>
                ) : (
                  <button className="soft-btn" onClick={() => setActiveView('avisos')}>
                    Publicar aviso
                  </button>
                )}
              </article>
            </section>
          )}

          {role === 'condomino' && activeView === 'pagos' && (
            <section className="panel animate-in">
              <h4>Pagos pendientes</h4>
              <div className="payment-list">
                {cuotasPendientes.map((cuota) => (
                  <article key={cuota.periodo} className="payment-item">
                    <div>
                      <p className="item-title">{cuota.periodo}</p>
                      <small>
                        Limite: {cuota.fechaLimite} | Recargo: ${cuota.recargo}
                      </small>
                    </div>
                    <p className="item-amount">${cuota.monto.toLocaleString('es-MX')}</p>
                    <div className="btn-row">
                      <button className="primary-btn" onClick={() => runAction('Registrando pago...', 'Pago registrado con exito')}>
                        Registrar pago
                      </button>
                      <button className="soft-btn" onClick={() => runAction('Subiendo comprobante...', 'Comprobante cargado correctamente')}>
                        Subir comprobante
                      </button>
                      <button className="soft-btn" onClick={() => runAction('Generando recibo...', 'Recibo PDF generado y listo para descarga')}>
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
                {pagosPendientesAdmin.map((pago) => (
                  <article key={pago.idPago} className="payment-item">
                    <div>
                      <p className="item-title">Pago #{pago.idPago}</p>
                      <small>
                        {pago.condominio} | Fecha: {pago.fecha}
                      </small>
                    </div>
                    <p className="item-amount">${pago.monto.toLocaleString('es-MX')}</p>
                    <div className="btn-row">
                      <button className="primary-btn" onClick={() => runAction('Validando pago...', 'Pago validado con exito')}>
                        Aprobar pago
                      </button>
                      <button className="soft-btn" onClick={() => runAction('Actualizando estado...', 'Pago rechazado y notificado')}>
                        Rechazar pago
                      </button>
                      <button className="soft-btn" onClick={() => runAction('Generando recibo...', 'Recibo generado y enviado')}>
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
                  {avisos.map((item) => (
                    <li key={item.id}>
                      <strong>{item.titulo}</strong>
                      <small>{item.fecha}</small>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel animate-in stagger-1">
                <h4>{role === 'condomino' ? 'Votacion activa' : 'Publicacion rapida'}</h4>
                <p>
                  {role === 'condomino'
                    ? '"Aprobar presupuesto de jardineria trimestral"'
                    : 'Crea avisos y votaciones en minutos para mantener informada a toda la comunidad.'}
                </p>
                <div className="btn-row">
                  {role === 'condomino' ? (
                    <>
                      <button className="primary-btn" onClick={() => runAction('Registrando voto...', 'Voto registrado con exito')}>
                        Votar a favor
                      </button>
                      <button className="soft-btn" onClick={() => runAction('Registrando voto...', 'Voto registrado con exito')}>
                        Votar en contra
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="primary-btn" onClick={() => runAction('Publicando aviso...', 'Aviso publicado con exito')}>
                        Publicar aviso
                      </button>
                      <button className="soft-btn" onClick={() => runAction('Creando votacion...', 'Votacion creada correctamente')}>
                        Crear votacion
                      </button>
                    </>
                  )}
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
                    onChange={(event) => setFalla(event.target.value)}
                    placeholder="Ejemplo: fuga en pasillo del edificio B"
                    rows={4}
                  />
                  <div className="btn-row">
                    <button
                      className="primary-btn"
                      onClick={() => runAction('Enviando reporte...', 'Reporte de mantenimiento enviado')}
                      disabled={!falla.trim()}
                    >
                      Enviar reporte
                    </button>
                  </div>
                </>
              ) : (
                <div className="payment-list">
                  <article className="payment-item">
                    <p className="item-title">Reporte #RM-90 | Fuga en pasillo B</p>
                    <small>Estado actual: EN_PROCESO</small>
                    <div className="btn-row">
                      <button className="soft-btn" onClick={() => runAction('Actualizando estado...', 'Estado actualizado a RESUELTO')}>
                        Marcar resuelto
                      </button>
                    </div>
                  </article>
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
                    {reportes.map((row) => (
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
                <button className="soft-btn" onClick={() => runAction('Exportando PDF...', 'Reporte PDF descargado')}>
                  <Icon name="download" />
                  Descargar PDF
                </button>
                <button className="soft-btn" onClick={() => runAction('Exportando Excel...', 'Reporte Excel descargado')}>
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
                <ul className="clean-list">
                  {gastosRecientes.map((gasto) => (
                    <li key={gasto.concepto}>
                      <strong>{gasto.concepto}</strong>
                      <small>
                        {gasto.categoria} | ${gasto.monto.toLocaleString('es-MX')}
                      </small>
                    </li>
                  ))}
                </ul>
                <div className="btn-row">
                  <button className="primary-btn" onClick={() => runAction('Guardando gasto...', 'Gasto registrado con exito')}>
                    Nuevo gasto
                  </button>
                </div>
              </article>

              <article className="panel animate-in stagger-1">
                <h4>Reporte financiero mensual</h4>
                <p className="big-number">$63,650</p>
                <small className="muted-text">Balance estimado del periodo actual</small>
                <div className="btn-row" style={{ marginTop: '0.7rem' }}>
                  <button className="soft-btn" onClick={() => runAction('Generando reporte...', 'Reporte financiero generado')}>
                    Generar reporte
                  </button>
                  <button className="soft-btn" onClick={() => runAction('Exportando Excel...', 'Excel descargado')}>
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

export default App;
