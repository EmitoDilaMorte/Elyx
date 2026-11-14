import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../../components/TurnstileWidget';
import { invitacionesApi } from '../../services/invitaciones.service';
import { PublicLayout } from './PublicLayout';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'verificando' }
  | { tipo: 'ok'; nombreCondominio: string }
  | { tipo: 'error'; mensaje: string };

/** Hay sitekey configurada en el frontend. */
function hayTurnstile(): boolean {
  return Boolean(((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim());
}

/**
 * Destino del enlace de confirmacion de la solicitud de alta.
 *
 * **Este endpoint exige Turnstile** (`TurnstileGuard` en el backend), asi que la
 * pagina tiene que esperar el token del widget antes de llamar. Antes no se
 * enviaba y en produccion (`TURNSTILE_ENABLED=true`) la confirmacion respondia
 * 400: quien hacia clic en el correo no podia verificar su cuenta.
 *
 * Cuando no hay sitekey configurada se confirma de inmediato: el backend con
 * `TURNSTILE_ENABLED=false` no lo exige, y esperar un token que nunca llega
 * dejaria la pagina cargando para siempre.
 */
export function ConfirmarInvitacionPage() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState<Estado>(
    hayTurnstile() ? { tipo: 'verificando' } : { tipo: 'cargando' },
  );
  const ejecutado = useRef(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const token = params.get('token') ?? '';

  const confirmar = useCallback(
    async (captchaToken: string) => {
      if (ejecutado.current) {
        return;
      }
      ejecutado.current = true;

      if (!token) {
        setEstado({
          tipo: 'error',
          mensaje: 'El enlace no incluye un token de confirmación.',
        });
        return;
      }

      setEstado({ tipo: 'cargando' });
      try {
        const data = await invitacionesApi.confirmar(token, captchaToken || undefined);
        setEstado({ tipo: 'ok', nombreCondominio: data.nombreCondominio });
      } catch (error) {
        setEstado({ tipo: 'error', mensaje: extraerMensaje(error) });
        // Los tokens de Turnstile son de un solo uso: sin reset, reintentar
        // mandaria el mismo y volveria a fallar.
        ejecutado.current = false;
        turnstileRef.current?.reset();
      }
    },
    [token],
  );

  useEffect(() => {
    if (hayTurnstile()) {
      return;
    }
    void confirmar('');
  }, [confirmar]);

  if (estado.tipo === 'verificando') {
    return (
      <PublicLayout title="Confirmando tu correo" subtitle="Un momento...">
        <p className="muted-text">
          Estamos comprobando que el enlace es válido. Esto toma solo un segundo.
        </p>
        {/* El widget puede resolverse sin interaccion; si pide un clic, aparece aqui. */}
        <TurnstileWidget
          ref={turnstileRef}
          action="confirmar_invitacion"
          onTokenChange={(nuevoToken) => {
            if (nuevoToken) {
              void confirmar(nuevoToken);
            }
          }}
          onError={(mensaje) => setEstado({ tipo: 'error', mensaje })}
        />
      </PublicLayout>
    );
  }

  if (estado.tipo === 'cargando') {
    return (
      <PublicLayout title="Confirmando tu correo" subtitle="Un momento...">
        <p className="muted-text">Validando el enlace...</p>
      </PublicLayout>
    );
  }

  if (estado.tipo === 'error') {
    return (
      <PublicLayout title="No pudimos confirmar tu correo">
        <div className="login-error">{estado.mensaje}</div>
        <p className="muted-text">
          Puedes volver a enviar tu solicitud con el enlace de invitación del condominio.
        </p>
        <div className="btn-row">
          <Link className="primary-btn" to="/login">
            Volver al inicio de sesión
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout title="Correo confirmado" subtitle={estado.nombreCondominio}>
      <p>
        Tu correo quedó verificado. El administrador del condominio revisará tu solicitud y te
        notificará cuando sea aprobada.
      </p>
      <div className="btn-row">
        <Link className="primary-btn" to="/login">
          Ir al inicio de sesión
        </Link>
      </div>
    </PublicLayout>
  );
}

function extraerMensaje(error: unknown): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  const inicioJson = mensaje.indexOf('{');
  if (inicioJson >= 0) {
    try {
      const data = JSON.parse(mensaje.slice(inicioJson)) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        return data.message.join(' ');
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
    } catch {
      /* se usa el mensaje crudo */
    }
  }
  return mensaje || 'El enlace no es válido o ya expiró.';
}
