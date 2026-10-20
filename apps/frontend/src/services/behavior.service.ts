import { getApiBaseUrl } from './apiBase';

export type TipoEventoComportamiento =
  | 'mousemove'
  | 'keydown'
  | 'pointerdown'
  | 'scroll'
  | 'visibilitychange';

export type EventoComportamiento = {
  tipo: TipoEventoComportamiento;
  t: number;
  x?: number;
  y?: number;
  dt?: number;
};

type EstadoComportamiento = {
  endpoint?: string;
  inicio?: number;
  eventos?: EventoComportamiento[];
  ultimo?: Partial<Record<TipoEventoComportamiento, number>>;
};

declare global {
  interface Window {
    __ELYX_BEHAVIOR__?: EstadoComportamiento;
  }
}

const CLAVE_SESION = 'elyx-behavior-session';

/**
 * Identificador de sesion de telemetria. Se reutiliza durante la pestaña y
 * viaja al backend en el login para asociar el score con el intento de acceso.
 */
export function getBehaviorSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const existente = window.sessionStorage.getItem(CLAVE_SESION);
    if (existente) {
      return existente;
    }

    const nuevo =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;

    window.sessionStorage.setItem(CLAVE_SESION, nuevo);
    return nuevo;
  } catch {
    return '';
  }
}

let enviando = false;

/**
 * Envia el lote pendiente. El script inline de `index.html` es quien captura
 * los eventos (asi el sitio los mide desde el primer milisegundo); aqui solo
 * se vacia el buffer para no duplicar escuchas.
 */
export async function enviarTelemetria(): Promise<void> {
  if (typeof window === 'undefined' || enviando) {
    return;
  }

  const estado = window.__ELYX_BEHAVIOR__;
  const pendientes = estado?.eventos;
  if (!estado || !pendientes || pendientes.length === 0) {
    return;
  }

  const eventos = pendientes.splice(0, 200);
  const sessionId = getBehaviorSessionId();
  if (!sessionId) {
    return;
  }

  const payload = {
    sessionId,
    ruta: window.location.pathname.slice(0, 255),
    webdriver: navigator.webdriver === true,
    tiempoFormularioMs: Math.max(0, Date.now() - (estado.inicio ?? Date.now())),
    eventos,
  };

  try {
    enviando = true;
    await fetch(`${getApiBaseUrl()}/behavior`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // La telemetria es best-effort: nunca bloquea la interfaz.
    pendientes.unshift(...eventos);
  } finally {
    enviando = false;
  }
}

/** Arranca el vaciado periodico y el envio al cerrar la pestaña. */
export function iniciarTelemetria(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const intervalo = window.setInterval(() => {
    void enviarTelemetria();
  }, 5000);

  const alOcultar = () => {
    void enviarTelemetria();
  };
  const alSalir = () => {
    void enviarTelemetria();
  };

  document.addEventListener('visibilitychange', alOcultar);
  window.addEventListener('pagehide', alSalir);

  return () => {
    window.clearInterval(intervalo);
    document.removeEventListener('visibilitychange', alOcultar);
    window.removeEventListener('pagehide', alSalir);
  };
}
