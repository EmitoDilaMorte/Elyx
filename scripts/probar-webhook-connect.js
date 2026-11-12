/**
 * Prueba del webhook de Connect con eventos firmados.
 *
 * Genera la firma con el mismo secreto que usa el backend y hace POST al
 * endpoint real. Sirve para verificar el guardian de `payment_status` y los
 * manejadores de eventos asincronos sin depender de que Stripe los envie.
 *
 * Se ejecuta dentro del contenedor del backend, que ya tiene `stripe` y el
 * secreto en el entorno:
 *   docker exec -w /app elyx-backend node /tmp/probar-webhook-connect.js
 */
const Stripe = require('stripe');

const secreto = process.env.STRIPE_WEBHOOK_SECRET_CONNECT;
if (!secreto) {
  console.error('Falta STRIPE_WEBHOOK_SECRET_CONNECT');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' });
const url = 'http://localhost:3000/api/webhooks/stripe/connect';

function evento(tipo, session, id) {
  return {
    id,
    object: 'event',
    api_version: '2025-10-29.clover',
    created: Math.floor(Date.now() / 1000),
    type: tipo,
    account: 'acct_test_guard',
    data: { object: session },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  };
}

async function enviar(etiqueta, tipo, session, id) {
  const payload = JSON.stringify(evento(tipo, session, id));
  const firma = stripe.webhooks.generateTestHeaderString({ payload, secret: secreto });

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': firma },
    body: payload,
  });

  const texto = await respuesta.text();
  console.log(`${etiqueta}: HTTP ${respuesta.status} -> ${texto}`);
}

async function main() {
  // 1. Sesion completada SIN dinero (OXXO pendiente): el guardian debe frenarla.
  await enviar(
    'completed-unpaid',
    'checkout.session.completed',
    {
      id: 'cs_test_guard_1',
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: null,
      metadata: {},
    },
    'evt_guard_unpaid',
  );

  // 2. Reintento con el mismo id: idempotencia.
  await enviar(
    'completed-unpaid-repetido',
    'checkout.session.completed',
    {
      id: 'cs_test_guard_1',
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: null,
      metadata: {},
    },
    'evt_guard_unpaid',
  );

  // 3. Sesion caducada: el cargo debe liberarse.
  await enviar(
    'expired',
    'checkout.session.expired',
    {
      id: 'cs_test_guard_1',
      object: 'checkout.session',
      status: 'expired',
      payment_status: 'unpaid',
      payment_intent: null,
      metadata: {},
    },
    'evt_guard_expired',
  );

  // 4. Pago asincrono que si entro: debe marcar la cuota pagada.
  await enviar(
    'async-succeeded',
    'checkout.session.async_payment_succeeded',
    {
      id: 'cs_test_guard_2',
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      payment_intent: null,
      metadata: {},
    },
    'evt_guard_async_ok',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
