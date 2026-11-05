import { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';

type CheckoutEmbebidoProps = {
  /** `client_secret` que devuelve el backend al crear el cobro. */
  clientSecret: string;
  /** Se invoca cuando Stripe confirma el pago y redirige. */
  onCompletado?: () => void;
};

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Carga Stripe.js una sola vez. `loadStripe` no debe llamarse en cada render:
 * inyecta un script y devuelve una promesa que conviene reutilizar.
 */
function obtenerStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const clave = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '').trim();
    if (!clave) {
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(clave);
    }
  }
  return stripePromise;
}

/**
 * Checkout de Stripe embebido.
 *
 * Usa `createEmbeddedCheckoutPage` (nombre de la API en @stripe/stripe-js v10;
 * en versiones anteriores era `initEmbeddedCheckout`), que monta el formulario
 * dentro del contenedor.
 *
 * Stripe Link aparece aqui automaticamente como metodo de pago: es una cartera
 * que Stripe habilita desde el Dashboard, no algo que se integre por codigo.
 *
 * El componente se destruye al desmontar (`checkout.destroy()`): sin eso el
 * iframe queda vivo y el siguiente montaje falla con "already initialized".
 */
export function CheckoutEmbebido({ clientSecret, onCompletado }: CheckoutEmbebidoProps) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const stripe = await obtenerStripe();
      if (cancelado) {
        return;
      }

      if (!stripe) {
        setError(
          'Falta configurar VITE_STRIPE_PUBLISHABLE_KEY en el frontend. Sin esa clave no se puede mostrar el formulario de pago.',
        );
        setCargando(false);
        return;
      }

      try {
        const checkout = await stripe.createEmbeddedCheckoutPage({
          clientSecret,
          onComplete: () => onCompletado?.(),
        });

        if (cancelado) {
          // El componente se desmonto mientras Stripe inicializaba: se libera
          // de inmediato para no dejar el iframe huerfano.
          checkout.destroy();
          return;
        }

        checkoutRef.current = checkout;
        if (contenedorRef.current) {
          checkout.mount(contenedorRef.current);
        }
        setCargando(false);
      } catch (err) {
        if (!cancelado) {
          setError(extraerMensaje(err, 'No fue posible cargar el formulario de pago.'));
          setCargando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, [clientSecret, onCompletado]);

  return (
    <div className="checkout-embebido">
      {cargando && !error && (
        <p className="muted-text">Cargando formulario de pago seguro...</p>
      )}
      {error && <div className="login-error">{error}</div>}
      <div ref={contenedorRef} id="checkout-embebido" />
      <p className="muted-text" style={{ marginTop: '0.75rem' }}>
        El pago lo procesa Stripe. Elyx nunca almacena los datos de tu tarjeta.
      </p>
    </div>
  );
}

function extraerMensaje(error: unknown, porDefecto: string): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  return mensaje || porDefecto;
}
