import type { ReactNode } from 'react';

type PublicLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

/**
 * Marco comun de las paginas publicas (registro, verificacion, invitacion).
 * Reutiliza la estetica del login para que el flujo se sienta parte de Elyx.
 */
export function PublicLayout({ title, subtitle, children, footer, wide }: PublicLayoutProps) {
  return (
    <div className="login-bg">
      <div className={`login-shell${wide ? ' public-shell-wide' : ''}`}>
        <div className="login-brand">
          <span className="brand-kicker">Elyx</span>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>

        <div className="login-card public-card">
          {children}
          {footer && <div className="public-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
