import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  claseEstadoCondominio,
  estadoCondominioDetalle,
  etiquetaEstadoCondominio,
} from '../../constants/status';
import { registroApi, type ResultadoVerificacion } from '../../services/registro.service';
import { PublicLayout } from './PublicLayout';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; resultado: ResultadoVerificacion }
  | { tipo: 'error'; mensaje: string };

/**
 * Destino del enlace enviado por correo. Confirma el buzon y crea el condominio.
 * El backend es idempotente: recargar la pagina no duplica nada.
 */
export function VerificarCorreoPage() {
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
      setEstado({ tipo: 'error', mensaje: 'El enlace no incluye un token de verificacion.' });
      return;
    }

    void registroApi
      .verificar(token)
      .then((resultado) => setEstado({ tipo: 'ok', resultado }))
      .catch((error) =>
        setEstado({ tipo: 'error', mensaje: extraerMensaje(error) }),
      );
  }, [token]);

  if (estado.tipo === 'cargando') {
    return (
      <PublicLayout title="Confirmando tu correo" subtitle="Un momento, estamos creando tu condominio.">
        <p className="muted-text">Verificando el enlace...</p>
      </PublicLayout>
    );
  }

  if (estado.tipo === 'error') {
    return (
      <PublicLayout title="No pudimos confirmar tu correo">
        <div className="login-error">{estado.mensaje}</div>
        <div className="btn-row">
          <Link className="primary-btn" to="/crear-condominio">
            Volver al registro
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const { resultado } = estado;

  return (
    <PublicLayout
      title="Tu condominio esta listo"
      subtitle={resultado.nombreCondominio}
    >
      <ul className="public-resumen">
        <li>
          <span>Unidades creadas</span>
          <strong>{resultado.unidadesCreadas}</strong>
        </li>
        <li>
          <span>Cuotas iniciales</span>
          <strong>{resultado.cuotasCreadas}</strong>
        </li>
        <li>
          <span>Estado del condominio</span>
          <span className={`status-pill ${claseEstadoCondominio(resultado.estadoCondominio)}`}>
            {etiquetaEstadoCondominio(resultado.estadoCondominio)}
          </span>
        </li>
      </ul>

      {resultado.requierePago ? (
        <div className="public-note">
          <strong>Falta confirmar el pago de la suscripcion</strong>
          <p>
            {estadoCondominioDetalle[resultado.estadoCondominio] ??
              'El condominio quedo registrado; falta el pago de la suscripcion.'}
          </p>
          <p>
            El pago se realiza por transferencia con la referencia que veras en la seccion
            <em> Suscripcion </em>del panel. Al confirmarse podras generar el enlace de invitacion.
          </p>
        </div>
      ) : (
        <div className="public-note">
          <strong>Ya puedes invitar a tus condominos</strong>
          <p>
            Inicia sesion con tu correo y contrasena y entra a <em>Invitaciones</em> para generar el
            enlace que compartiras con los condominos.
          </p>
        </div>
      )}

      <div className="btn-row">
        <Link className="primary-btn" to="/login">
          Iniciar sesion
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
