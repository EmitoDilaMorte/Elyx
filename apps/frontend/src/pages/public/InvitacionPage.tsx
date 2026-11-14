import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { publicoApi, type PaginaInvitacion } from '../../services/publico.service';
import { PublicLayout } from './PublicLayout';
import { VistaCondominio } from './VistaCondominio';

/**
 * Entrada desde un enlace de invitacion (`/invitacion/<token>`).
 *
 * **No es un formulario.** Muestra la pagina publica del condominio con una
 * seccion extra para unirse, porque quien recibe el enlace quiere saber primero
 * a donde lo estan invitando. El formulario de alta vive en `/registro`.
 *
 * Los enlaces ya compartidos siguen funcionando: la ruta y el token no
 * cambiaron.
 */
export function InvitacionPage() {
  // La app resuelve rutas a mano sobre `useLocation` (no usa <Routes>), asi que
  // `useParams()` siempre devuelve vacio: el token se extrae del pathname.
  const { pathname } = useLocation();
  const token = extraerToken(pathname);

  const [pagina, setPagina] = useState<PaginaInvitacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Sin token no se llama a la API: evita un 404 por una ruta vacia.
    if (!token) {
      setError('El enlace no incluye un token de invitación.');
      setCargando(false);
      return;
    }

    let cancelado = false;
    void publicoApi
      .invitacion(token)
      .then((datos) => {
        if (!cancelado) {
          setPagina(datos);
        }
      })
      .catch(() => {
        if (!cancelado) {
          setError('No pudimos leer el enlace de invitación. Revisa que esté completo.');
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [token]);

  if (cargando) {
    return (
      <PublicLayout title="Invitación a un condominio" subtitle="Cargando...">
        <p className="muted-text">Un momento...</p>
      </PublicLayout>
    );
  }

  if (error) {
    return (
      <PublicLayout title="No pudimos abrir la invitación">
        <div className="login-error">{error}</div>
        <p className="muted-text">
          Pide al administrador del condominio que te comparta un enlace nuevo.
        </p>
        <div className="btn-row">
          <Link to="/login" className="soft-btn">
            Ir a Elyx
          </Link>
        </div>
      </PublicLayout>
    );
  }

  // Token invalido o de otro condominio: no hay pagina que mostrar.
  if (!pagina?.condominio) {
    return (
      <PublicLayout title="Enlace no disponible">
        <div className="reminder-box">
          <strong className="reminder-title">Este enlace ya no sirve</strong>
          <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
            {pagina?.invitacion.motivo ?? 'Este enlace de invitación no es válido.'}
          </p>
        </div>
        <p className="muted-text">
          Contacta al administrador del condominio para que genere uno nuevo.
        </p>
        <div className="btn-row">
          <Link to="/login" className="soft-btn">
            Ir a Elyx
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <VistaCondominio
      condominio={pagina.condominio}
      invitacion={pagina.invitacion}
      tokenInvitacion={token}
    />
  );
}

/** Ultimo segmento de `/invitacion/<token>`. */
function extraerToken(pathname: string): string {
  const segmentos = pathname.split('/').filter((segmento) => segmento.length > 0);
  return segmentos.length >= 2 ? segmentos[segmentos.length - 1] : '';
}
