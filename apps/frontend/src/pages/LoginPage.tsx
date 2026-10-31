import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { MathCaptcha } from '../components/MathCaptcha';
import { MfaStep } from '../components/MfaStep';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../components/TurnstileWidget';
import { backendApi, type LoginOutcome, type LoginPayload } from '../services/backendApi.service';
import { getBehaviorSessionId } from '../services/behavior.service';

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
  /** Devuelve el desenlace: sesion iniciada, MFA pendiente o error. */
  onLogin: (payload: LoginPayload) => Promise<LoginOutcome>;
  onVerifyMfa: (
    challengeId: string,
    codigo: string,
    metodo: 'TOTP' | 'EMAIL',
    recordarme: boolean,
  ) => Promise<LoginOutcome>;
  onResendMfa: (challengeId: string) => Promise<string>;
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
  onVerifyMfa,
  onResendMfa,
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

  // Turnstile: tokens de un solo uso, por eso se reinicia el widget tras cada intento.
  const turnstileConfigured = Boolean(
    ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim(),
  );
  const loginCaptchaRef = useRef<TurnstileWidgetHandle | null>(null);
  const forgotCaptchaRef = useRef<TurnstileWidgetHandle | null>(null);
  const resetCaptchaRef = useRef<TurnstileWidgetHandle | null>(null);
  const [loginCaptchaToken, setLoginCaptchaToken] = useState('');
  const [forgotCaptchaToken, setForgotCaptchaToken] = useState('');
  const [resetCaptchaToken, setResetCaptchaToken] = useState('');

  // Segundo CAPTCHA propio. El token CSRF no se guarda en estado: viaja en la
  // cookie y lo copia `requestJson` a la cabecera en cada peticion mutante.
  const [math, setMath] = useState<{ challengeId: string; question: string } | null>(null);
  const [mathAnswer, setMathAnswer] = useState('');
  const [forgotMath, setForgotMath] = useState<{ challengeId: string; question: string } | null>(null);
  const [forgotMathAnswer, setForgotMathAnswer] = useState('');
  const [resetMath, setResetMath] = useState<{ challengeId: string; question: string } | null>(null);
  const [resetMathAnswer, setResetMathAnswer] = useState('');
  const [enviando, setEnviando] = useState(false);

  // "Mantener sesion iniciada": el backend deja una cookie legible con la
  // ultima eleccion, asi el formulario la recuerda sin tocar el refresh token.
  const [recordarme, setRecordarme] = useState(true);
  const [preferenciaGuardada, setPreferenciaGuardada] = useState(false);

  useEffect(() => {
    const galleta = document.cookie
      .split('; ')
      .find((item) => item.startsWith('elyx_recordar='));
    if (!galleta) {
      return;
    }

    const valor = galleta.split('=')[1];
    setRecordarme(valor !== '0');
    setPreferenciaGuardada(true);
  }, []);

  const olvidarDispositivo = () => {
    document.cookie = 'elyx_recordar=; path=/; max-age=0';
    setRecordarme(true);
    setPreferenciaGuardada(false);
  };

  // Paso MFA.
  const [mfa, setMfa] = useState<{ challengeId: string; metodos: Array<'TOTP' | 'EMAIL'> } | null>(null);
  const [mfaCodigo, setMfaCodigo] = useState('');
  const [mfaMetodo, setMfaMetodo] = useState<'TOTP' | 'EMAIL'>('TOTP');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaMensaje, setMfaMensaje] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);

  const handleLoginCaptchaToken = useCallback((token: string) => setLoginCaptchaToken(token), []);
  const handleForgotCaptchaToken = useCallback((token: string) => setForgotCaptchaToken(token), []);
  const handleResetCaptchaToken = useCallback((token: string) => setResetCaptchaToken(token), []);

  const handleCorreoChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCorreoChange(event.target.value);
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPasswordChange(event.target.value);
  };

  const cargarMath = useCallback(async (scope: 'login' | 'forgot' | 'reset') => {
    try {
      const data = await backendApi.captchaMatematico(scope);
      const desafio = { challengeId: data.challengeId, question: data.question };
      if (scope === 'login') {
        setMath(desafio);
        setMathAnswer('');
      } else if (scope === 'forgot') {
        setForgotMath(desafio);
        setForgotMathAnswer('');
      } else {
        setResetMath(desafio);
        setResetMathAnswer('');
      }
    } catch {
      // Sin segundo CAPTCHA disponible: el backend decidira si lo exige.
    }
  }, []);

  useEffect(() => {
    void cargarMath('login');
  }, [cargarMath]);

  useEffect(() => {
    if (forgotStep === 'email') {
      void cargarMath('forgot');
    } else if (forgotStep === 'password') {
      void cargarMath('reset');
    }
  }, [forgotStep, cargarMath]);

  const handleLoginClick = async () => {
    if (enviando) {
      return;
    }

    setEnviando(true);

    try {
      const outcome = await onLogin({
        captchaToken: loginCaptchaToken,
        mathChallengeId: math?.challengeId ?? '',
        mathAnswer,
        behaviorSessionId: getBehaviorSessionId(),
        recordarme,
      });

      if (outcome.status === 'mfa') {
        setMfa({ challengeId: outcome.challengeId, metodos: outcome.metodos });
        setMfaMetodo(outcome.metodos.includes('TOTP') ? 'TOTP' : 'EMAIL');
        setMfaCodigo('');
        setMfaError(null);
        setMfaMensaje(null);
        return;
      }

      loginCaptchaRef.current?.reset();
      setLoginCaptchaToken('');

      if (outcome.status === 'error') {
        void cargarMath('login');
      }
    } finally {
      setEnviando(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfa) {
      return;
    }

    setMfaLoading(true);
    setMfaError(null);
    const outcome = await onVerifyMfa(mfa.challengeId, mfaCodigo.trim(), mfaMetodo, recordarme);
    setMfaLoading(false);

    if (outcome.status === 'error') {
      setMfaError('Codigo de verificacion invalido o expirado. Intenta de nuevo.');
    } else if (outcome.status === 'mfa') {
      setMfa({ challengeId: outcome.challengeId, metodos: outcome.metodos });
      setMfaCodigo('');
    }
  };

  const handleMfaResend = async () => {
    if (!mfa) {
      return;
    }

    setMfaLoading(true);
    setMfaError(null);
    setMfaMensaje(null);
    try {
      const mensaje = await onResendMfa(mfa.challengeId);
      setMfaMensaje(mensaje);
      setMfaMetodo('EMAIL');
    } catch (error) {
      setMfaError(getErrorMessage(error));
    } finally {
      setMfaLoading(false);
    }
  };

  const cancelarMfa = () => {
    setMfa(null);
    setMfaCodigo('');
    setMfaError(null);
    setMfaMensaje(null);
    void cargarMath('login');
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
      const res = await backendApi.forgotPassword(
        forgotCorreo.trim(),
        forgotCaptchaToken,
        forgotMath ? { challengeId: forgotMath.challengeId, answer: forgotMathAnswer } : undefined,
      );
      setForgotMsg(res.message);
    } catch (error) {
      console.error(error);
      setForgotError(getErrorMessage(error));
      void cargarMath('forgot');
    } finally {
      forgotCaptchaRef.current?.reset();
      setForgotCaptchaToken('');
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
      const res = await backendApi.resetPassword(
        resetToken.trim(),
        resetPassword,
        resetCaptchaToken,
        resetMath ? { challengeId: resetMath.challengeId, answer: resetMathAnswer } : undefined,
      );
      setForgotMsg(res.message);
      setForgotStep('none');
      setForgotCorreo('');
      setResetToken('');
      setResetPassword('');
    } catch (error) {
      console.error(error);
      setForgotError(getErrorMessage(error));
      void cargarMath('reset');
    } finally {
      resetCaptchaRef.current?.reset();
      setResetCaptchaToken('');
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
    setForgotCaptchaToken('');
    setResetCaptchaToken('');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (mfa) {
    return (
      <div className="app-bg login-bg">
        <section className="login-shell animate-in">
          <div className="login-brand">
            <p className="brand-kicker">Plataforma condominal</p>
            <h1>Elyx</h1>
            <p><strong>Segundo factor de seguridad</strong></p>
            <p>Tu contraseña es correcta. Falta verificar que eres tu.</p>
          </div>
          <article className="login-card">
            <MfaStep
              metodos={mfa.metodos}
              codigo={mfaCodigo}
              metodo={mfaMetodo}
              loading={mfaLoading}
              error={mfaError}
              mensaje={mfaMensaje}
              onChangeCodigo={setMfaCodigo}
              onChangeMetodo={setMfaMetodo}
              onVerify={() => void handleMfaVerify()}
              onResend={() => void handleMfaResend()}
              onCancel={cancelarMfa}
            />
          </article>
        </section>
        {loadingLabel && <div className="loading-pill" role="status"><span className="spinner" />{loadingLabel}</div>}
      </div>
    );
  }

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
                    <MathCaptcha
                      challengeId={forgotMath?.challengeId ?? ''}
                      question={forgotMath?.question ?? ''}
                      value={forgotMathAnswer}
                      onChange={setForgotMathAnswer}
                      onRefresh={() => void cargarMath('forgot')}
                      disabled={forgotLoading}
                    />
                    <TurnstileWidget ref={forgotCaptchaRef} action="forgot-password" onTokenChange={handleForgotCaptchaToken} />
                    {forgotError && <p className="login-error">{forgotError}</p>}
                    <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                      <button className="soft-btn" type="button" onClick={cerrarForgot}>Cancelar</button>
                      <button className="primary-btn" type="button" onClick={handleForgotPassword} disabled={!forgotCorreo.trim() || forgotLoading || (turnstileConfigured && !forgotCaptchaToken) || (Boolean(forgotMath) && !forgotMathAnswer.trim())}>{forgotLoading ? 'Enviando...' : 'Enviar enlace'}</button>
                    </div>
                  </>
                )
              )}
              {forgotStep === 'password' && (
                <>
                  <p className="helper-text">{forgotMsg || 'Define una nueva contraseña.'}</p>
                  <label className="field-label" htmlFor="reset-password">Nueva contraseña</label>
                  <input id="reset-password" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Minimo 8 caracteres" />
                  <MathCaptcha
                    challengeId={resetMath?.challengeId ?? ''}
                    question={resetMath?.question ?? ''}
                    value={resetMathAnswer}
                    onChange={setResetMathAnswer}
                    onRefresh={() => void cargarMath('reset')}
                    disabled={forgotLoading}
                  />
                  <TurnstileWidget ref={resetCaptchaRef} action="reset-password" onTokenChange={handleResetCaptchaToken} />
                  {forgotMsg && <p className="helper-text" style={{ color: 'var(--green)' }}>{forgotMsg}</p>}
                  {forgotError && <p className="login-error">{forgotError}</p>}
                  <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                    <button className="soft-btn" type="button" onClick={cerrarForgot}>Cancelar</button>
                    <button className="primary-btn" type="button" onClick={handleResetPassword} disabled={!resetPassword.trim() || forgotLoading || (turnstileConfigured && !resetCaptchaToken) || (Boolean(resetMath) && !resetMathAnswer.trim())}>{forgotLoading ? 'Cambiando...' : 'Cambiar contraseña'}</button>
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

          <label className="field-label" htmlFor="password-login">Contraseña</label>
          <input id="password-login" type="password" value={password} onChange={handlePasswordChange} placeholder="********" />

          <div className="recordarme-row">
            <input
              id="recordarme-login"
              type="checkbox"
              name="recordarme"
              checked={recordarme}
              onChange={(evento) => setRecordarme(evento.target.checked)}
            />
            <label htmlFor="recordarme-login">Mantener sesión iniciada</label>
          </div>
          {preferenciaGuardada && (
            <p className="helper-text recordarme-ayuda">
              Este dispositivo ya tiene una preferencia guardada.{' '}
              <button className="link-btn" type="button" onClick={olvidarDispositivo}>
                No recordar este dispositivo
              </button>
            </p>
          )}

          <MathCaptcha
            challengeId={math?.challengeId ?? ''}
            question={math?.question ?? ''}
            value={mathAnswer}
            onChange={setMathAnswer}
            onRefresh={() => void cargarMath('login')}
            disabled={Boolean(loadingLabel)}
          />

          <TurnstileWidget ref={loginCaptchaRef} action="login" onTokenChange={handleLoginCaptchaToken} />

          {loginError && <p className="login-error">{loginError}</p>}

          <button
            className="primary-btn login-btn"
            type="button"
            onClick={handleLoginClick}
            disabled={enviando || Boolean(loadingLabel) || (turnstileConfigured && !loginCaptchaToken)}
          >
            Entrar
          </button>

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
        {
          subtitle: '1.6 Informacion de autenticacion y segundo factor',
          items: [
            'Contraseña almacenada solo como hash bcrypt, nunca en texto claro',
            'Historial de intentos de inicio de sesion: correo, IP, resultado y motivo',
            'Sesiones activas: familia del token, creacion, expiracion, IP y agente de usuario',
            'Estado del segundo factor y secreto TOTP cifrado con AES-256-GCM',
            'Codigos de recuperacion almacenados como hash y su estado de uso',
            'Preferencia "mantener sesion iniciada" del dispositivo',
          ],
        },
        {
          subtitle: '1.7 Verificacion de interaccion humana',
          items: [
            'Tipo de evento, marcas de tiempo e intervalos entre eventos',
            'Coordenadas relativas del cursor y tiempo en el formulario',
            'Indicador tecnico de automatizacion del navegador',
            'Puntaje de riesgo y veredicto resultante',
          ],
        },
        {
          subtitle: '1.8 Verificacion de seguridad de terceros',
          items: [
            'Cloudflare Turnstile recibe IP, agente de usuario y señales tecnicas del navegador',
            'Elyx recibe unicamente el resultado de la verificacion',
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
      items: [
        'Elyx no vende informacion personal',
        'Con administradores del condominio, para su gestion',
        'Con proveedores bajo confidencialidad: hosting, envio de correo transaccional y verificacion de seguridad (Cloudflare Turnstile, que recibe IP y agente de usuario)',
        'Por requerimiento legal o para proteger derechos y seguridad',
        'Ningun proveedor recibe contraseñas, tokens de sesion, secretos de segundo factor ni codigos de recuperacion',
      ],
    },
    {
      title: '5. Proteccion de la informacion',
      body: 'Token de acceso de vida corta (15 minutos) y token de sesion rotatorio en cookie HttpOnly inaccesible para JavaScript; si se reutiliza un token ya rotado se cierran todas las sesiones de esa cadena. Proteccion CSRF de doble envio en las operaciones que modifican datos. Segundo factor opcional (aplicacion autenticadora o codigo por correo) con el secreto TOTP cifrado con AES-256-GCM y codigos de recuperacion con hash. Bloqueo progresivo tras varios intentos fallidos (5, 15, 30 y 60 minutos) y limite de frecuencia de peticiones. Contraseñas con hash bcrypt. Aislamiento por condominio en cada peticion. Auditoria permanente de intentos de acceso.',
    },
    {
      title: '6. Derechos del usuario',
      body: 'Acceso, rectificacion, eliminacion, portabilidad, oposicion y limitacion. Contacto: emiliano.aristarod@gmail.com - Responsable: Emiliano Arista Rodriguez.',
    },
    {
      title: '7. Retencion de datos',
      items: [
        'Cuotas, pagos, recibos y reportes financieros: minimo 7 anos',
        'Comprobantes y evidencias de pago: mientras el pago exista, 7 anos tras su validacion',
        'Intentos de inicio de sesion: hasta 12 meses',
        'Sesiones rotadas o revocadas: hasta 30 dias despues de expirar',
        'Telemetria de interaccion humana: maximo 30 dias',
        'Codigos de recuperacion de MFA: mientras el segundo factor este activo',
        'Bloqueos por intentos fallidos: 24 horas',
        'Preferencia "mantener sesion iniciada": hasta 30 dias o hasta eliminarla',
      ],
    },
    {
      title: '8. Cookies',
      items: [
        'elyx_rt (esencial): token de sesion rotatorio. HttpOnly, viaja solo a las rutas de autenticacion. Dura 7 dias si se marca "mantener sesion iniciada"; si no, termina al cerrar el navegador (maximo 12 horas)',
        'elyx_csrf (esencial): token de doble envio para proteger operaciones que modifican datos. No contiene informacion del usuario. Dura 2 horas',
        'elyx_recordar (esencial): recuerda si se marco "mantener sesion iniciada" en este dispositivo. Solo contiene 1 o 0. Dura 30 dias o se elimina al pulsar "no recordar este dispositivo"',
        'No usamos cookies publicitarias ni de perfilado. Puedes rechazar las cookies en tu navegador, aunque la sesion y las notificaciones en tiempo real dejarian de funcionar',
      ],
    },
    {
      title: '9. Verificacion de interaccion humana',
      body: 'Para distinguir personas de automatizaciones medimos tipo de evento, marcas de tiempo, coordenadas del cursor y el indicador navigator.webdriver. No se registran los valores escritos en los campos, ni contraseñas, ni el contenido de los mensajes. Los datos se conservan un maximo de 30 dias, no se comparten con terceros y solo refuerzan la verificacion: un puntaje bajo no afecta el estado de cuenta, las cuotas ni los pagos.',
    },
    {
      title: '10. Privacidad por rol',
      items: [
        'Condominos: acceso a su propia informacion financiera.',
        'Administradores: acceso agregado del condominio y gestion de usuarios.',
        'Superusuarios: gestion de multiples condominios y auditoria.',
      ],
    },
    {
      title: '11. Cambios a esta politica',
      body: 'Notificamos cambios significativos via la aplicacion o correo electronico. Ultima actualizacion: Octubre 2026, con el segundo factor de autenticacion, la rotacion de sesiones, la proteccion CSRF, la verificacion de interaccion humana y la auditoria de accesos.',
    },
    {
      title: '12. Responsabilidad internacional',
      body: 'Los datos se almacenan y procesan en Mexico.',
    },
    {
      title: '13. Contacto',
      body: 'Correo: emiliano.aristarod@gmail.com. Soporte tecnico y reportes de seguridad al mismo correo.',
    },
  ];

  return (
    <div className="privacy-full-content">
      <p><strong>Ultima actualizacion:</strong> Octubre 2026</p>

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

  // Rate limiting (HTTP 429): se informa el tiempo de espera al usuario.
  const status = (error as { status?: number } | undefined)?.status;
  if (status === 429) {
    const retryAfter = (error as { retryAfter?: number | null } | undefined)?.retryAfter;
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      const minutos = Math.floor(retryAfter / 60);
      const segundos = retryAfter % 60;
      const espera = minutos > 0
        ? `${minutos} min${segundos > 0 ? ` ${segundos} s` : ''}`
        : `${segundos} s`;
      return `Demasiados intentos. Vuelve a intentarlo en ${espera}.`;
    }
    return 'Demasiadas solicitudes. Espera un momento antes de reintentar.';
  }

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
