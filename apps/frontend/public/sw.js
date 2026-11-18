/*
 * Service worker de Elyx.
 *
 * Solo gestiona Web Push: no cachea nada a proposito. Un service worker con
 * cache en un panel que cambia todos los dias sirve pantallas viejas y es la
 * causa mas comun de "no me aparece el cambio". La app ya es rapida sin cache.
 *
 * Se registra en `main.tsx` y se sirve desde `/sw.js` con `expires -1` en
 * nginx, para que el navegador siempre tome la version actual.
 */

self.addEventListener('install', () => {
  // Toma el control sin esperar a que se cierren las pestanas abiertas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let datos = {};

  if (event.data) {
    try {
      datos = event.data.json();
    } catch {
      datos = { cuerpo: event.data.text() };
    }
  }

  const titulo = datos.titulo || 'Elyx';
  const opciones = {
    body: datos.cuerpo || 'Tienes una nueva notificacion.',
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    // `tag` hace que una notificacion del mismo tipo reemplace a la anterior
    // en lugar de apilarse (util para recordatorios de la misma cuota).
    tag: datos.tag || undefined,
    renotify: Boolean(datos.tag),
    data: { url: datos.url || '/inicio' },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const destino = (event.notification.data && event.notification.data.url) || '/inicio';

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si Elyx ya esta abierto, se reutiliza esa pestana en lugar de abrir
      // otra: el usuario no termina con cinco copias del panel.
      for (const ventana of ventanas) {
        if ('focus' in ventana) {
          try {
            if ('navigate' in ventana) {
              await ventana.navigate(destino);
            }
          } catch {
            // `navigate` falla si la ventana es de otro origen; se ignora.
          }
          return ventana.focus();
        }
      }

      return self.clients.openWindow(destino);
    })(),
  );
});
