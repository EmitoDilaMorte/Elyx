import { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';

type CheckoutEmbebidoProps = {
  /** `client_secret` que devuelve el backend al crear el cobro. */
  clientSecret: string;
  /**
   * Se invoca cuando Stripe confirma el pago DENTRO del iframe.
   *
   * Solo se dispara cuando no hubo redireccion: con 3D Secure el banco obliga a
   * salir al `return_url` y este callback nunca corre. Por eso el padre debe
   * manejar tambien el regreso por URL; los dos caminos se complementan.
   */
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
 * que Stripe habilita desde el Dashboard del condominio, no algo que se integre
 * por codigo.
 *
 * El componente se destruye al desmontar (`checkout.destroy()`): sin eso el
 * iframe queda vivo y el siguiente montaje falla con "already initialized".
 *
 * **Como se entera Elyx de que el pago termino.** La sesion se crea con el
 * comportamiento por defecto de Stripe (`redirect_on_completion: if_required`),
 * asi que hay dos caminos:
 *  - Sin 3D Secure: el iframe muestra la confirmacion y se invoca `onComplete`.
 *  - Con 3D Secure: el banco exige salir, Stripe navega al `return_url` y el
 *    padre detecta el regreso por la URL. `onComplete` no se invoca.
 *
 * Se cubren los dos: `onCompletado` aqui y el sondeo de `?checkout=ok` en el
 * padre. Antes se decia en este comentario que el backend mandaba
 * `redirect_on_completion: always`, pero nunca fue cierto: el pago normal con
 * tarjeta no redirigia y la pantalla no se enteraba de nada.
 */
export function CheckoutEmbebido({ clientSecret, onCompletado }: CheckoutEmbebidoProps) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // El callback vive en un ref: si estuviera en las dependencias del efecto,
  // una flecha inline del padre lo recrearia en cada render y el iframe se
  // remontaria, borrando lo que el usuario estaba escribiendo.
  const alCompletarRef = useRef<CheckoutEmbebidoProps['onCompletado']>(onCompletado);
  useEffect(() => {
    alCompletarRef.current = onCompletado;
  }, [onCompletado]);

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
          onComplete: () => alCompletarRef.current?.(),
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
