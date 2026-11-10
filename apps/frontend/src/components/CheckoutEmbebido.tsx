import { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';

type CheckoutEmbebidoProps = {
  /** `client_secret` que devuelve el backend al crear el cobro. */
  clientSecret: string;
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
 *
 * No se pasa `onComplete` a proposito: el backend crea la sesion con
 * `redirect_on_completion: always` (necesario para que Link y 3DS funcionen),
 * asi que al pagar la pagina navega al `return_url` y ese callback nunca se
 * invocaria. Stripe.js lo advierte en consola si se le pasa. El regreso se
 * maneja en `SuscripcionPanel` leyendo `?checkout=ok`.
 */
export function CheckoutEmbebido({ clientSecret }: CheckoutEmbebidoProps) {
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
        const checkout = await stripe.createEmbeddedCheckoutPage({ clientSecret });

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
    // `clientSecret` es el unico disparador legitimo: si cambia, la sesion de
    // cobro es otra y hay que remontar. El efecto NO depende de props de
    // callback: una flecha inline del padre recrearia el efecto en cada render
    // y destruiria el iframe, borrando lo que el usuario estaba escribiendo.
  }, [clientSecret]);

  return (
    <div className="checkout-embebido">
      <p className="checkout-embebido-titulo">Pago seguro</p>
      {cargando && !error && (
        <p className="muted-text">Cargando formulario de pago seguro...</p>
      )}
      {error && <div className="login-error">{error}</div>}
      <div ref={contenedorRef} className="checkout-embebido-montaje" />
      <p className="muted-text checkout-embebido-nota">
        El pago lo procesa Stripe. Elyx nunca almacena los datos de tu tarjeta.
      </p>
    </div>
  );
}

function extraerMensaje(error: unknown, porDefecto: string): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  return mensaje || porDefecto;
}
