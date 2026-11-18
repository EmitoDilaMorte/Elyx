import { backendApi } from './backendApi.service';

/**
 * Notificaciones del navegador (Web Push).
 *
 * Requisitos por navegador:
 *  - Chrome, Edge, Firefox y Safari de escritorio: funciona con permiso normal.
 *  - iOS/iPadOS: solo si la PWA esta instalada en la pantalla de inicio y el
 *    sistema es 16.4 o superior. En Safari "de pestana" la API ni existe.
 *
 * El permiso se pide SOLO cuando el usuario pulsa el boton. Pedirlo al entrar
 * hace que muchos lo bloqueen para siempre, y un permiso bloqueado no se puede
 * volver a pedir desde la pagina.
 */

export type EstadoPush =
  | 'no-soportado'
  | 'sin-configurar'
  | 'inactivo'
  | 'activo'
  | 'bloqueado';

export type ResultadoActivacion = {
  ok: boolean;
  estado: EstadoPush;
  mensaje: string;
};

const URL_SW = '/sw.js';

/** `true` si el navegador expone las APIs necesarias. */
export function soportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * iOS solo entrega push a la PWA instalada.
 *
 * Se detecta por user agent porque en iOS el resto de APIs no lo distinguen.
 */
export function esIosSinInstalar(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent;
  const esIos =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  if (!esIos) {
    return false;
  }

  // `standalone` existe en iOS cuando se abrio desde el icono de inicio.
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  return !standalone;
}

export function permiso(): NotificationPermission | 'no-soportado' {
  if (!soportado()) {
    return 'no-soportado';
  }
  return Notification.permission;
}

/** Registra el service worker. Idempotente: el navegador reutiliza el mismo. */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!soportado()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(URL_SW, { scope: '/' });
  } catch (error) {
    console.error('No fue posible registrar el service worker:', error);
    return null;
  }
}

function base64UrlAArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizado = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = window.atob(normalizado);
  const buffer = new ArrayBuffer(crudo.length);
  const vista = new Uint8Array(buffer);

  for (let i = 0; i < crudo.length; i += 1) {
    vista[i] = crudo.charCodeAt(i);
  }

  return buffer;
}

/** Estado actual, sin pedir permisos ni registrar nada. */
export async function estado(): Promise<EstadoPush> {
  if (!soportado()) {
    return 'no-soportado';
  }

  const clave = await backendApi.pushClave().catch(() => null);
  if (!clave?.configurado || !clave.clave) {
    return 'sin-configurar';
  }

  if (Notification.permission === 'denied') {
    return 'bloqueado';
  }

  if (Notification.permission !== 'granted') {
    return 'inactivo';
  }

  const registro = await navigator.serviceWorker.getRegistration(URL_SW);
  const suscripcion = await registro?.pushManager.getSubscription();
  return suscripcion ? 'activo' : 'inactivo';
}

/**
 * Pide permiso y registra la suscripcion en el backend.
 *
 * Se llama desde el boton "Activar notificaciones del navegador". Devuelve el
 * estado resultante para que la UI muestre el motivo exacto cuando falla.
 */
export async function activar(idCondominio?: number): Promise<ResultadoActivacion> {
  if (!soportado()) {
    return {
      ok: false,
      estado: 'no-soportado',
      mensaje: 'Este navegador no admite notificaciones del sistema.',
    };
  }

  if (esIosSinInstalar()) {
    return {
      ok: false,
      estado: 'no-soportado',
      mensaje:
        'En iPhone o iPad primero agrega Elyx a la pantalla de inicio (Compartir > Agregar a inicio) y activa las notificaciones desde ahi.',
    };
  }

  const claveRespuesta = await backendApi.pushClave().catch(() => null);
  if (!claveRespuesta?.configurado || !claveRespuesta.clave) {
    return {
      ok: false,
      estado: 'sin-configurar',
      mensaje: 'El servidor no tiene configuradas las notificaciones push.',
    };
  }

  const permisoObtenido = await Notification.requestPermission();
  if (permisoObtenido !== 'granted') {
    return {
      ok: false,
      estado: permisoObtenido === 'denied' ? 'bloqueado' : 'inactivo',
      mensaje:
        permisoObtenido === 'denied'
          ? 'Bloqueaste las notificaciones para Elyx. Puedes volver a permitirlas desde los ajustes del sitio en tu navegador.'
          : 'No se concedio el permiso de notificaciones.',
    };
  }

  const registro = await registrarServiceWorker();
  if (!registro) {
    return {
      ok: false,
      estado: 'inactivo',
      mensaje: 'No fue posible preparar el service worker del navegador.',
    };
  }

  await navigator.serviceWorker.ready;

  const existente = await registro.pushManager.getSubscription();
  const suscripcion =
    existente ??
    (await registro.pushManager.subscribe({
      // Chrome exige `userVisibleOnly: true`: no se permiten push silenciosos.
      userVisibleOnly: true,
      applicationServerKey: base64UrlAArrayBuffer(claveRespuesta.clave),
    }));

  await backendApi.pushSuscribir({
    endpoint: suscripcion.endpoint,
    keys: {
      p256dh: arrayBufferABase64Url(suscripcion.getKey('p256dh')),
      auth: arrayBufferABase64Url(suscripcion.getKey('auth')),
    },
    idCondominio,
  });

  return { ok: true, estado: 'activo', mensaje: 'Notificaciones del navegador activadas.' };
}

/** Da de baja el dispositivo actual. */
export async function desactivar(idCondominio?: number): Promise<boolean> {
  if (!soportado()) {
    return false;
  }

  const registro = await navigator.serviceWorker.getRegistration(URL_SW);
  const suscripcion = await registro?.pushManager.getSubscription();

  if (!suscripcion) {
    return false;
  }

  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe().catch(() => undefined);
  await backendApi.pushDesuscribir(endpoint, idCondominio).catch(() => undefined);

  return true;
}

/**
 * Vuelve a registrar la suscripcion existente al iniciar sesion.
 *
 * Sin esto, si el usuario activo push, cerro sesion y entro con otra cuenta en
 * el mismo equipo, el endpoint seguiria apuntando a la cuenta anterior.
 */
export async function sincronizar(idCondominio?: number): Promise<void> {
  if (!soportado() || Notification.permission !== 'granted') {
    return;
  }

  try {
    const registro = await registrarServiceWorker();
    const suscripcion = await registro?.pushManager.getSubscription();
    if (!suscripcion) {
      return;
    }

    await backendApi.pushSuscribir({
      endpoint: suscripcion.endpoint,
      keys: {
        p256dh: arrayBufferABase64Url(suscripcion.getKey('p256dh')),
        auth: arrayBufferABase64Url(suscripcion.getKey('auth')),
      },
      idCondominio,
    });
  } catch {
    // Un fallo aqui no debe impedir el uso de la app.
  }
}

function arrayBufferABase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) {
    return '';
  }

  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binario += String.fromCharCode(bytes[i]);
  }

  return window
    .btoa(binario)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const pushService = {
  soportado,
  esIosSinInstalar,
  permiso,
  estado,
  activar,
  desactivar,
  sincronizar,
  registrarServiceWorker,
};
