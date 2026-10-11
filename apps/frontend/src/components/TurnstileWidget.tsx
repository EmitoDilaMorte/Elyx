import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type TurnstileWidgetHandle = {
  /** Reinicia el widget para obtener un token nuevo (los tokens son de un solo uso). */
  reset: () => void;
  /** Token actual, o cadena vacía si aun no se ha completado el desafio. */
  getToken: () => string;
};

type TurnstileWidgetProps = {
  /** Marca de la verificacion; se envia a Cloudflare y se valida en el backend. */
  action?: string;
  onTokenChange?: (token: string) => void;
  onError?: (message: string) => void;
  className?: string;
};

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('No se pudo cargar Turnstile.')), { once: true });
    document.head.appendChild(script);
  });
}

/**
 * Widget de Cloudflare Turnstile con render explicito.
 *
 * Se implementa a mano (sin dependencias extra) y expone `reset()` porque los
 * tokens de Turnstile son de un solo uso: tras cada intento fallido hay que
 * pedir uno nuevo al usuario.
 */
const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { action, onTokenChange, onError, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [siteKey] = useState<string>(
    ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim(),
  );

  useEffect(() => {
    if (!siteKey) {
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) {
          return;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          ...(action ? { action } : {}),
          callback: (token: string) => onTokenChange?.(token),
          'error-callback': () => {
            onTokenChange?.('');
            onError?.('No se pudo verificar la seguridad. Intenta de nuevo.');
          },
          'expired-callback': () => {
            onTokenChange?.('');
          },
        });
      })
      .catch(() => {
        onError?.('No se pudo cargar la verificacion de seguridad.');
      });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* el widget ya no existe */
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action, onTokenChange, onError]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        const widgetId = widgetIdRef.current;
        if (widgetId && window.turnstile) {
          window.turnstile.reset(widgetId);
        }
        onTokenChange?.('');
      },
      getToken: () => {
        const widgetId = widgetIdRef.current;
        if (widgetId && window.turnstile) {
          return window.turnstile.getResponse(widgetId) ?? '';
        }
        return '';
      },
    }),
    [onTokenChange],
  );

  if (!siteKey) {
    return null;
  }

  return <div ref={containerRef} className={className} data-testid="turnstile-widget" />;
});

export default TurnstileWidget;
