import type { ChangeEvent } from 'react';
import { Icon } from '../components/Icon';

type LoginPageProps = {
  correo: string;
  password: string;
  loginError: string | null;
  loadingLabel: string | null;
  feedback: string | null;
  onCorreoChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
};

export function LoginPage({
  correo,
  password,
  loginError,
  loadingLabel,
  feedback,
  onCorreoChange,
  onPasswordChange,
  onLogin,
}: LoginPageProps) {
  const handleCorreoChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCorreoChange(event.target.value);
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPasswordChange(event.target.value);
  };

  return (
    <div className="app-bg login-bg">
      <section className="login-shell animate-in">
        <div className="login-brand">
          <p className="brand-kicker">Plataforma condominal</p>
          <h1>Elyx</h1>
          <p>
            <strong>Finanzas condominales claras y sin papeles</strong>
          </p>
          <p>Accede para operar pagos, avisos, validaciones y reportes reales.</p>
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
            onChange={handleCorreoChange}
            placeholder="usuario@elyx.mx"
          />

          <label className="field-label" htmlFor="password-login">
            Contrasena
          </label>
          <input
            id="password-login"
            type="password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="********"
          />

          <div className="login-hint">
            <p>Usuarios de acceso:</p>
            <ul className="hint-list">
              <li>condomino@elyx.mx / Elyx123</li>
              <li>admin@elyx.mx / Elyx123</li>
            </ul>
          </div>

          {loginError && <p className="login-error">{loginError}</p>}

          <button className="primary-btn login-btn" type="button" onClick={onLogin}>
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
