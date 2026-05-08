import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

type LoginPageProps = {
  correo: string;
  password: string;
  loginError: string | null;
  loadingLabel: string | null;
  feedback: string | null;
  requiereCambio: boolean;
  cambioFeedback: string | null;
  passwordActual: string;
  passwordNueva: string;
  onCorreoChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
  onPerfilChange: (value: { correo: string; passwordActual: string; passwordNueva: string }) => void;
  onCambiarPasswordForzado: () => void;
};

export function LoginPage({
  correo,
  password,
  loginError,
  loadingLabel,
  feedback,
  requiereCambio,
  cambioFeedback,
  passwordActual,
  passwordNueva,
  onCorreoChange,
  onPasswordChange,
  onLogin,
  onPerfilChange,
  onCambiarPasswordForzado,
}: LoginPageProps) {
  const [showFullPrivacy, setShowFullPrivacy] = useState(false);
  const [forgotStep, setForgotStep] = useState<'none' | 'email' | 'password'>('none');
  const [forgotCorreo, setForgotCorreo] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const autoTokenCheck = useRef(false);

  const handleCorreoChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCorreoChange(event.target.value);
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPasswordChange(event.target.value);
  };

  useEffect(() => {
    if (autoTokenCheck.current) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (!tokenParam) return;

    autoTokenCheck.current = true;
    setResetToken(tokenParam);
    setForgotStep('password');
  }, []);

  const handleForgotPassword = async () => {
    if (!forgotCorreo.trim()) return;
    setForgotLoading(true);
    setForgotError(null);
    try {
      const apiModule = await import('../services/backendApi.service');
      const res = await apiModule.backendApi.forgotPassword(forgotCorreo.trim());
      setForgotMsg(res.message);
    } catch (error) {
      console.error(error);
      setForgotError(getErrorMessage(error));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken.trim() || !resetPassword.trim()) return;
    if (resetPassword.length < 8) {
      setForgotError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    try {
      const apiModule = await import('../services/backendApi.service');
      const res = await apiModule.backendApi.resetPassword(resetToken.trim(), resetPassword);
      setForgotMsg(res.message);
      setForgotStep('none');
      setForgotCorreo('');
      setResetToken('');
      setResetPassword('');
    } catch (error) {
      console.error(error);
      setForgotError(getErrorMessage(error));
    } finally {
      setForgotLoading(false);
    }
  };

  const cerrarForgot = () => {
    setForgotStep('none');
    setForgotCorreo('');
    setResetToken('');
    setResetPassword('');
    setForgotMsg(null);
    setForgotError(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (requiereCambio) {
    return (
      <div className="app-bg login-bg">
        <section className="login-shell animate-in">
          <div className="login-brand">
            <p className="brand-kicker">Plataforma condominal</p>
            <h1>Elyx</h1>
            <p><strong>Cambio de contraseña requerido</strong></p>
            <p>Por seguridad, debes cambiar tu contraseña antes de continuar.</p>
          </div>
          <article className="login-card">
            <h2>Nueva contraseña</h2>
            <label className="field-label" htmlFor="password-actual">contraseña actual</label>
            <input id="password-actual" type="password" value={passwordActual} onChange={(event) => onPerfilChange({ correo, passwordActual: event.target.value, passwordNueva })} placeholder="contraseña temporal" />
            <label className="field-label" htmlFor="password-nueva">contraseña nueva</label>
            <input id="password-nueva" type="password" value={passwordNueva} onChange={(event) => onPerfilChange({ correo, passwordActual, passwordNueva: event.target.value })} placeholder="Minimo 8 caracteres" />
            {cambioFeedback && <p className="login-error">{cambioFeedback}</p>}
            <button className="primary-btn login-btn" type="button" onClick={onCambiarPasswordForzado} disabled={!passwordActual || !passwordNueva || passwordNueva.length < 8}>Cambiar contraseña</button>
          </article>
        </section>
        {loadingLabel && <div className="loading-pill" role="status"><span className="spinner" />{loadingLabel}</div>}
      </div>
    );
  }

  if (showFullPrivacy) {
    return (
      <div className="app-bg login-bg privacy-page">
        <div className="super-shell privacy-shell">
          <article className="panel privacy-full privacy-full-panel animate-in">
            <div className="privacy-header">
              <div>
                <p className="brand-kicker">Documento legal</p>
                <h2>Politica de Privacidad</h2>
                <p className="helper-text">Revision general de como Elyx usa y protege la informacion de la plataforma.</p>
              </div>
              <button className="soft-btn" type="button" onClick={() => setShowFullPrivacy(false)}>
                &larr; Volver al inicio
              </button>
            </div>
            <PrivacyContent />
            <div className="privacy-footer-actions">
              <button className="primary-btn" type="button" onClick={() => setShowFullPrivacy(false)}>Volver al inicio de sesion</button>
            </div>
          </article>
        </div>
      </div>
    );
  }

  if (forgotStep !== 'none') {
    return (
      <div className="app-bg login-bg privacy-page">
        <div className="super-shell privacy-shell">
          <article className="panel forgot-full-panel animate-in">
            <div className="privacy-header">
              <div>
                <p className="brand-kicker">Recuperacion de acceso</p>
                <h2>
                  {forgotStep === 'email' ? 'Recuperar contraseña' : 'Restablecer contraseña'}
                </h2>
                <p className="helper-text">Sigue los pasos para recuperar el acceso a Elyx.</p>
              </div>
              <button className="soft-btn" type="button" onClick={cerrarForgot}>
                &larr; Volver al inicio
              </button>
            </div>

            <div className="forgot-flow">
              {forgotStep === 'email' && (
                forgotMsg ? (
                  <>
                    <p className="helper-text" style={{ color: 'var(--green)', marginBottom: '0.75rem' }}>{forgotMsg}</p>
                    <div className="btn-row">
                      <button className="soft-btn" type="button" onClick={cerrarForgot}>Volver al inicio</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="helper-text">Ingresa tu correo para recibir un enlace de recuperacion.</p>
                    <label className="field-label" htmlFor="forgot-correo">Correo</label>
                    <input id="forgot-correo" type="email" value={forgotCorreo} onChange={(e) => setForgotCorreo(e.target.value)} placeholder="usuario@elyx.mx" />
                    {forgotError && <p className="login-error">{forgotError}</p>}
                    <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                      <button className="soft-btn" type="button" onClick={cerrarForgot}>Cancelar</button>
                      <button className="primary-btn" type="button" onClick={handleForgotPassword} disabled={!forgotCorreo.trim() || forgotLoading}>{forgotLoading ? 'Enviando...' : 'Enviar enlace'}</button>
                    </div>
                  </>
                )
              )}
              {forgotStep === 'password' && (
                <>
                  <p className="helper-text">{forgotMsg || 'Define una nueva contraseña.'}</p>
                  <label className="field-label" htmlFor="reset-password">Nueva contraseña</label>
                  <input id="reset-password" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Minimo 8 caracteres" />
                  {forgotMsg && <p className="helper-text" style={{ color: 'var(--green)' }}>{forgotMsg}</p>}
                  {forgotError && <p className="login-error">{forgotError}</p>}
                  <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                    <button className="soft-btn" type="button" onClick={cerrarForgot}>Cancelar</button>
                    <button className="primary-btn" type="button" onClick={handleResetPassword} disabled={!resetPassword.trim() || forgotLoading}>{forgotLoading ? 'Cambiando...' : 'Cambiar contraseña'}</button>
                  </div>
                </>
              )}
            </div>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg login-bg">
      <section className="login-shell animate-in">
        <div className="login-brand">
          <p className="brand-kicker">Plataforma condominal</p>
          <h1>Elyx</h1>
          <p><strong>Finanzas condominales claras y sin papeles</strong></p>
          <p>Accede para operar pagos, avisos, validaciones y reportes reales.</p>
        </div>

        <article className="login-card">
          <h2>Iniciar sesion</h2>

          <label className="field-label" htmlFor="correo-login">Correo</label>
          <input id="correo-login" type="email" value={correo} onChange={handleCorreoChange} placeholder="usuario@elyx.mx" />

          <label className="field-label" htmlFor="password-login">contraseña</label>
          <input id="password-login" type="password" value={password} onChange={handlePasswordChange} placeholder="********" />

          {loginError && <p className="login-error">{loginError}</p>}

          <button className="primary-btn login-btn" type="button" onClick={onLogin}>Entrar</button>

          <div className="login-actions">
            <button className="soft-btn compact-btn" type="button" onClick={() => setForgotStep('email')}>
              Olvide mi contraseña
            </button>
            <button className="soft-btn compact-btn" type="button" onClick={() => setShowFullPrivacy(true)}>
              Ver politica de privacidad
            </button>
          </div>

        </article>
      </section>

      {loadingLabel && <div className="loading-pill" role="status"><span className="spinner" />{loadingLabel}</div>}
      {feedback && <div className="feedback-pill" role="status"><Icon name="check" />{feedback}</div>}
    </div>
  );
}

function PrivacyContent() {
  const sections: Array<{
    title: string;
    body?: string;
    items?: string[];
    blocks?: Array<{ subtitle: string; items: string[] }>;
  }> = [
    {
      title: '1. Informacion que recopilamos',
      blocks: [
        {
          subtitle: '1.1 Informacion personal del usuario',
          items: [
            'Nombre completo y documento de identidad',
            'Correo electronico y numero telefonico',
            'Direccion del inmueble o unidad habitacional',
            'Rol dentro del condominio',
            'Informacion de acceso y autenticacion (contraseña encriptada, tokens JWT)',
            'Datos de perfil y preferencias de usuario',
          ],
        },
        {
          subtitle: '1.2 Informacion financiera',
          items: [
            'Historial de pagos de mantenimiento y cuotas condominales',
            'Metodos de pago utilizados',
            'Estado de cuenta, adeudos y detalles de recibos',
            'Informacion de gastos, presupuestos y reportes financieros',
          ],
        },
        {
          subtitle: '1.3 Informacion de actividad',
          items: [
            'Avisos y notificaciones enviadas y recibidas',
            'Participacion en votaciones',
            'Solicitudes de mantenimiento o reparaciones',
            'Evidencias de pago y fotos de mantenimiento',
            'Historial de reportes consultados',
          ],
        },
        {
          subtitle: '1.4 Informacion tecnica',
          items: [
            'Direccion IP y datos de conexion',
            'Tipo de dispositivo, navegador y sistema operativo',
            'Timestamps de acceso y actividad',
            'Datos de uso y navegacion dentro de la plataforma',
          ],
        },
        {
          subtitle: '1.5 Informacion del condominio',
          items: [
            'Datos estructurales del condominio',
            'Configuracion de notificaciones y preferencias administrativas',
          ],
        },
      ],
    },
    {
      title: '2. Como recopilamos la informacion',
      items: [
        'Directamente del usuario: al registrarse, completar su perfil, realizar pagos o cargar documentos',
        'Automaticamente: a traves de cookies y registros del servidor',
        'De terceros: de proveedores de servicios de pago, si es necesario',
      ],
    },
    {
      title: '3. Uso de la informacion',
      items: [
        'Gestion financiera: procesar pagos, generar recibos y estados de cuenta',
        'Administracion: gestion de cuotas, gastos, reportes financieros y de mantenimiento',
        'Comunicaciones: enviar avisos y notificaciones',
        'Votaciones: permitir participacion en procesos democraticos',
        'Mantenimiento: gestionar solicitudes de reparaciones',
        'Seguridad y cumplimiento legal',
      ],
    },
    {
      title: '4. Comparticion de la informacion',
      body: 'Elyx no vende informacion personal. Compartimos datos con administradores del condominio, proveedores de servicios bajo confidencialidad y por requerimiento legal.',
    },
    {
      title: '5. Proteccion de la informacion',
      body: 'Implementamos encriptacion en transito y reposo, autenticacion JWT, accesos restringidos por roles, monitoreo continuo y actualizaciones regulares de seguridad.',
    },
    {
      title: '6. Derechos del usuario',
      body: 'Acceso, rectificacion, eliminacion, portabilidad, oposicion y limitacion. Contacto: emiliano.aristarod@gmail.com - Responsable: Emiliano Arista Rodriguez.',
    },
    {
      title: '7. Retencion de datos',
      body: 'Datos activos mientras la cuenta este activa. Registros financieros minimo 7 anos. Logs entre 90 y 365 dias.',
    },
    {
      title: '8. Cookies',
      body: 'Usamos cookies esenciales para sesiones seguras y de analisis para mejorar el servicio. Puedes rechazarlas, aunque puede afectar funcionalidades en tiempo real.',
    },
    {
      title: '9. Privacidad por rol',
      items: [
        'Condominos: acceso a su propia informacion financiera.',
        'Administradores: acceso agregado del condominio y gestion de usuarios.',
        'Superusuarios: gestion de multiples condominios y auditoria.',
      ],
    },
    {
      title: '10. Cambios a esta politica',
      body: 'Notificamos cambios significativos via la aplicacion o correo electronico.',
    },
    {
      title: '11. Responsabilidad internacional',
      body: 'Los datos se almacenan y procesan en Mexico.',
    },
    {
      title: '12. Contacto',
      body: 'Correo: emiliano.aristarod@gmail.com. Soporte tecnico y reportes de seguridad al mismo correo.',
    },
  ];

  return (
    <div className="privacy-full-content">
      <p><strong>Ultima actualizacion:</strong> Mayo 2026</p>

      <p>En <strong>Elyx</strong>, nos comprometemos a proteger la privacidad de nuestros usuarios. Esta Politica de Privacidad explica como recopilamos, usamos, almacenamos y protegemos la informacion personal de quienes utilizan nuestra plataforma de gestion y administracion de condominios.</p>

      {sections.map((section) => (
        <section className="privacy-card" key={section.title}>
          <h3>{section.title}</h3>
          {section.blocks ? (
            section.blocks.map((block) => (
              <div className="privacy-subsection" key={block.subtitle}>
                <h4>{block.subtitle}</h4>
                <ul>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))
          ) : section.items ? (
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>{section.body}</p>
          )}
        </section>
      ))}

      <hr />
      <p><strong>Al utilizar Elyx, aceptas plenamente los terminos de esta Politica de Privacidad.</strong></p>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  const apiError = error as Record<string, unknown> | undefined;
  if (error instanceof Error) {
    const marker = ': ';
    const markerIndex = error.message.indexOf(marker);
    if (markerIndex >= 0) {
      const rawBody = error.message.slice(markerIndex + marker.length).trim();
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody) as { message?: string | string[] };
          if (Array.isArray(parsed.message)) {
            return parsed.message.join('. ');
          }
          if (typeof parsed.message === 'string') {
            if (parsed.message === 'Correo no registrado.') {
              return 'Ese correo no esta registrado. Verifica e intenta de nuevo.';
            }
            return parsed.message;
          }
        } catch {
          return rawBody;
        }
      }
    }
    return error.message;
  }
  if (apiError?.message) return String(apiError.message);
  if (apiError?.error) return String(apiError.error);
  return 'Error inesperado.';
}
