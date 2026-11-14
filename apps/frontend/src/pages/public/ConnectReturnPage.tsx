import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PublicLayout } from './PublicLayout';

type Estado = 'verificando' | 'listo' | 'pendiente';

/**
 * Regreso del onboarding hospedado por Stripe.
 *
 * **Solo se usa cuando el componente embebido no pudo cargarse.** El camino
 * normal monta el formulario dentro de Elyx y no navega a ningún lado, así que
 * estas dos rutas existen para que el respaldo no termine en una página en
 * blanco.
 *
 * `return` significa que el administrador completó el flujo; `refresh` que la
 * sesión caducó a medio camino y Stripe pide reiniciarlo. En los dos casos lo
 * útil es volver al panel de cobro, donde se consulta el estado real de la
 * cuenta: nunca se asume el resultado por la URL.
 */
export function ConnectReturnPage() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [estado, setEstado] = useState<Estado>('verificando');

  const esRefresh = pathname.startsWith('/connect/refresh');
  const idCondominio = params.get('idCondominio');

  useEffect(() => {
    // El estado real lo tiene Stripe, no la URL: aquí solo se decide qué texto
    // mostrar. La consulta se hace en el panel de cobro al volver.
    setEstado(esRefresh ? 'pendiente' : 'listo');
  }, [esRefresh]);

  const volver = idCondominio ? `/suscripcion?idCondominio=${idCondominio}` : '/suscripcion';

  if (estado === 'verificando') {
    return (
      <PublicLayout title="Volviendo a Elyx" subtitle="Un momento...">
        <p className="muted-text">Comprobando el estado de la verificación...</p>
      </PublicLayout>
    );
  }

  if (estado === 'pendiente') {
    return (
      <PublicLayout title="La verificación quedó a medias" subtitle="Stripe necesita más datos">
        <p className="muted-text">
          La sesión de verificación caducó antes de terminar. No se perdió nada de lo que ya
          capturaste: al volver al panel puedes retomarla donde la dejaste.
        </p>
        <div className="btn-row">
          <Link className="primary-btn" to={volver}>
            Volver al panel de cobro
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout title="Verificación enviada" subtitle="Stripe está revisando tu condominio">
      <p className="muted-text">
        Ya enviaste los datos. Stripe los revisa y habilita los cobros con tarjeta en cuanto
        termine; el estado se actualiza solo en el panel de cobro. Mientras tanto, la transferencia
        SPEI sigue funcionando.
      </p>
      <div className="btn-row">
        <Link className="primary-btn" to={volver}>
          Volver al panel de cobro
        </Link>
      </div>
    </PublicLayout>
  );
}
