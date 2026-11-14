import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { publicoApi, type CondominioPublico } from '../../services/publico.service';
import { PublicLayout } from './PublicLayout';
import { VistaCondominio } from './VistaCondominio';

/**
 * Pagina publica del condominio (`/condominio/:id`).
 *
 * Es la URL que se declara a Stripe como `business_url`. Se sirve sin
 * autenticacion a proposito: Stripe la revisa periodicamente para confirmar que
 * el negocio existe y que la descripcion coincide con lo declarado.
 *
 * No confundir con `/invitacion/:token`: esa ruta resuelve el token y renderiza
 * la misma vista **con** la seccion para unirse. Aqui no hay token, asi que esa
 * seccion no aparece.
 */
export function CondominioPublicoPage() {
  // La app no usa <Routes>: el id se extrae del pathname.
  const { pathname } = useLocation();
  const id = extraerId(pathname);

  const [condominio, setCondominio] = useState<CondominioPublico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) {
      setError('La dirección no incluye un condominio.');
      setCargando(false);
      return;
    }

    let cancelado = false;
    void publicoApi
      .condominio(id)
      .then((datos) => {
        if (!cancelado) {
          setCondominio(datos);
        }
      })
      .catch(() => {
        if (!cancelado) {
          // El backend responde 404 tanto si no existe como si la pagina esta
          // apagada. No se distingue a proposito: revelaria que IDs existen.
          setError('No encontramos este condominio.');
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
  }, [id]);

  if (cargando) {
    return (
      <PublicLayout title="Condominio" subtitle="Cargando...">
        <p className="muted-text">Un momento...</p>
      </PublicLayout>
    );
  }

  if (error || !condominio) {
    return (
      <PublicLayout title="Condominio no disponible">
        <p className="muted-text">
          {error ?? 'No encontramos este condominio.'} Verifica que la dirección esté completa.
        </p>
      </PublicLayout>
    );
  }

  return <VistaCondominio condominio={condominio} invitacion={null} />;
}

/** Ultimo segmento de `/condominio/<id>`. */
export function extraerId(pathname: string): number | null {
  const segmentos = pathname.split('/').filter((segmento) => segmento.length > 0);
  const ultimo = segmentos[segmentos.length - 1] ?? '';
  const numero = Number(ultimo);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}
