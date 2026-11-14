import { useEffect, useRef, useState } from 'react';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';

type ConnectOnboardingProps = {
  /** `clientSecret` de la Account Session que devuelve el backend. */
  clientSecret: string;
  /**
   * Pide un `clientSecret` nuevo al backend.
   *
   * Stripe la invoca cuando la sesión en curso necesita renovarse (por ejemplo,
   * al pasar de una sección a otra después de un rato). No se puede cachear: un
   * secreto viejo no sirve.
   */
  onRefrescarSecreto: () => Promise<string>;
  /** Se invoca cuando el condominio termina o abandona el flujo en Stripe. */
  onSalir?: () => void;
};

/**
 * Onboarding de Stripe Connect **dentro de Elyx**.
 *
 * Sustituye a la redirección a `connect.stripe.com`: monta el formulario de
 * Stripe en la propia página, así que el administrador captura el RFC, la cuenta
 * bancaria y la verificación de identidad sin salir de la aplicación y sin ver
 * nunca el dashboard de Stripe (`dashboard: 'none'`).
 *
 * El componente es un custom element que Stripe inyecta en el DOM. Se monta en
 * un nodo propio y se limpia al desmontar: sin eso, al volver a entrar Stripe
 * falla con "already initialized" y el formulario queda en blanco.
 */
export function ConnectOnboarding({
  clientSecret,
  onRefrescarSecreto,
  onSalir,
}: ConnectOnboardingProps) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);

  // Los callbacks viven en refs: si estuvieran en las dependencias del efecto,
  // una flecha inline del padre lo recrearía en cada render y el formulario de
  // Stripe se remontaría, borrando lo que el usuario estaba escribiendo.
  const alSalirRef = useRef(onSalir);
  const alRefrescarRef = useRef(onRefrescarSecreto);
  useEffect(() => {
    alSalirRef.current = onSalir;
    alRefrescarRef.current = onRefrescarSecreto;
  }, [onSalir, onRefrescarSecreto]);

  useEffect(() => {
    let cancelado = false;
    const contenedor = contenedorRef.current;

    const clave = ((import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? '').trim();
    if (!clave) {
      setError(
        'Falta configurar VITE_STRIPE_PUBLISHABLE_KEY en el frontend. Sin esa clave no se puede mostrar el formulario de verificación.',
      );
      return;
    }

    void (async () => {
      try {
        // Se reutiliza la instancia entre montajes: el script de Stripe solo
        // debe cargarse una vez por sesión del navegador, y `loadConnectAndInitialize`
        // crea un `<script>` cada vez que se le llama.
        const instancia = await obtenerInstancia(clave, () =>
          alRefrescarRef.current(),
        );
        if (cancelado || !contenedor) {
          return;
        }

        const onboarding = instancia.create('account-onboarding');
        onboarding.setOnExit(() => alSalirRef.current?.());
        contenedor.appendChild(onboarding);
        setMontado(true);
      } catch (err) {
        if (!cancelado) {
          setError(
            (err as Error)?.message ||
              'No fue posible cargar el formulario de verificación de Stripe.',
          );
        }
      }
    })();

    return () => {
      cancelado = true;
      // Sin esto el elemento queda en el DOM y al volver a montarlo Stripe
      // falla con "already initialized".
      if (contenedor) {
        contenedor.innerHTML = '';
      }
    };
    // `clientSecret` es el único disparador legítimo: si cambia, la sesión de
    // onboarding es otra y hay que remontar.
  }, [clientSecret]);

  return (
    <div className="connect-onboarding">
      {error && <div className="login-error">{error}</div>}
      {!error && !montado && (
        <p className="muted-text">Cargando el formulario de verificación de Stripe...</p>
      )}
      <div ref={contenedorRef} className="connect-onboarding-montaje" />
      <p className="muted-text connect-onboarding-nota">
        Stripe verifica la identidad del condominio y su cuenta bancaria. Elyx nunca ve ni almacena
        esos datos.
      </p>
    </div>
  );
}

/**
 * Instancia única de Connect por carga de página.
 *
 * `loadConnectAndInitialize` inyecta el script de Stripe la primera vez y crea
 * una instancia que sirve para todos los componentes. Se guarda para no
 * inyectarlo dos veces.
 */
let instanciaPromise: Promise<StripeConnectInstance> | null = null;

function obtenerInstancia(
  publishableKey: string,
  fetchClientSecret: () => Promise<string>,
): Promise<StripeConnectInstance> {
  if (!instanciaPromise) {
    instanciaPromise = Promise.resolve(
      loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          variables: {
            colorPrimary: '#0a8a7c',
            colorBackground: '#fffcf8',
            colorText: '#1f1f2e',
            fontFamily: "'Manrope', 'Trebuchet MS', sans-serif",
            borderRadius: '12px',
          },
        },
      }),
    ).catch((error) => {
      // Si la inicialización falla (script bloqueado, clave inválida), NO se
      // cachea la promesa rechazada: sin esto, cualquier reintento posterior
      // reutilizaría el mismo fallo y el formulario quedaría en blanco hasta
      // recargar la página entera.
      instanciaPromise = null;
      throw error;
    });
  }
  return instanciaPromise;
}
