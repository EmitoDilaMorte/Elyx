import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { invitacionesApi } from '../../services/invitaciones.service';
import { PublicLayout } from './PublicLayout';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; estado: string; nombreCondominio: string }
  | { tipo: 'error'; mensaje: string };

/** Destino del enlace de confirmacion de la solicitud de alta. */
export function ConfirmarInvitacionPage() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const ejecutado = useRef(false);
  const token = params.get('token') ?? '';

  useEffect(() => {
    if (ejecutado.current) {
      return;
    }
    ejecutado.current = true;

    if (!token) {
      setEstado({ tipo: 'error', mensaje: 'El enlace no incluye un token de confirmacion.' });
      return;
    }

    void invitacionesApi
      .confirmar(token)
      .then((data) =>
        setEstado({ tipo: 'ok', estado: data.estado, nombreCondominio: data.nombreCondominio }),
      )
      .catch((error) => setEstado({ tipo: 'error', mensaje: extraerMensaje(error) }));
  }, [token]);

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
          Puedes volver a enviar tu solicitud con el enlace de invitacion del condominio.
        </p>
        <div className="btn-row">
          <Link className="primary-btn" to="/login">
            Volver al inicio de sesion
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout title="Correo confirmado" subtitle={estado.nombreCondominio}>
      <p>
        Tu correo quedo verificado. El administrador del condominio revisara tu solicitud y te
        notificara cuando sea aprobada.
      </p>
      <div className="btn-row">
        <Link className="primary-btn" to="/login">
          Ir al inicio de sesion
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
  return mensaje || 'El enlace no es valido o ya expiro.';
}
