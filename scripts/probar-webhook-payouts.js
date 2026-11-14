/**
 * Prueba de los eventos `payout.*` en el webhook de Connect.
 *
 * Genera la firma con el mismo secreto que usa el backend y hace POST al
 * endpoint real. Sirve para verificar el upsert de `depositos_condominio` sin
 * depender de que Stripe envie los eventos (la cuenta de test no tiene
 * movimientos reales).
 *
 * Uso:
 *   docker cp scripts/probar-webhook-payouts.js elyx-backend:/app/pwp.js
 *   docker exec -w /app elyx-backend node pwp.js [acct_...]
 *   docker exec elyx-backend rm -f /app/pwp.js
 *
 * El segundo argumento es la cuenta conectada del condominio que se quiere
 * probar. Por defecto usa `acct_1Ub9fHDMdbqDU7B3` (condominio 2 en desarrollo).
 */
const Stripe = require('stripe');

const secreto = process.env.STRIPE_WEBHOOK_SECRET_CONNECT;
if (!secreto) {
  console.error('Falta STRIPE_WEBHOOK_SECRET_CONNECT');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' });
const url = 'http://localhost:3000/api/webhooks/stripe/connect';

const CUENTA = process.argv[2] || 'acct_1Ub9fHDMdbqDU7B3';

/** Sufijo unico por corrida: el webhook es idempotente por id de evento. */
const CORRIDA = Date.now().toString(36);

function payout({ id, monto, estado, llegaEn, tipo = 'bank_account', metodo = 'standard' }) {
  return {
    id,
    object: 'payout',
    amount: monto,
    currency: 'mxn',
    status: estado,
    method: metodo,
    type: tipo,
    arrival_date: llegaEn,
    automatic: true,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    metadata: {},
    description: null,
    destination: 'ba_test_fase5',
    failure_code: null,
    failure_message: null,
    original_payout: null,
    reversed_by: null,
    reconciliation_status: 'not_applicable',
    source_type: 'card',
    statement_descriptor: null,
    trace_id: null,
  };
}

function evento(tipo, objeto, id, cuenta) {
  return {
    id,
    object: 'event',
    api_version: '2025-10-29.clover',
    created: Math.floor(Date.now() / 1000),
    type: tipo,
    account: cuenta,
    data: { object: objeto },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  };
}

async function enviar(etiqueta, tipo, objeto, id, cuenta = CUENTA) {
  const payload = JSON.stringify(evento(tipo, objeto, id, cuenta));
  const firma = stripe.webhooks.generateTestHeaderString({ payload, secret: secreto });

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': firma },
    body: payload,
  });

  const texto = await respuesta.text();
  console.log(`${etiqueta.padEnd(34)} HTTP ${respuesta.status} -> ${texto}`);
}

async function main() {
  const enUnaSemana = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const ayer = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  // Payout 1: se crea, luego se confirma como pagado (dos eventos, una fila).
  const id1 = `po_f5_${CORRIDA}_a`;
  await enviar(
    'payout.created (payout 1)',
    'payout.created',
    payout({ id: id1, monto: 180000, estado: 'pending', llegaEn: enUnaSemana }),
    `evt_f5_${CORRIDA}_a1`,
  );
  await enviar(
    'payout.paid   (payout 1)',
    'payout.paid',
    payout({ id: id1, monto: 180000, estado: 'paid', llegaEn: ayer }),
    `evt_f5_${CORRIDA}_a2`,
  );

  // Payout 2: falla.
  const id2 = `po_f5_${CORRIDA}_b`;
  await enviar(
    'payout.failed (payout 2)',
    'payout.failed',
    payout({ id: id2, monto: 95000, estado: 'failed', llegaEn: ayer }),
    `evt_f5_${CORRIDA}_b1`,
  );

  // Payout 3: en camino, por tarjeta instantanea.
  const id3 = `po_f5_${CORRIDA}_c`;
  await enviar(
    'payout.updated (payout 3)',
    'payout.updated',
    payout({
      id: id3,
      monto: 50000,
      estado: 'in_transit',
      llegaEn: enUnaSemana,
      tipo: 'card',
      metodo: 'instant',
    }),
    `evt_f5_${CORRIDA}_c1`,
  );

  // Evento repetido: debe responder evento-duplicado.
  await enviar(
    'payout.paid repetido (payout 1)',
    'payout.paid',
    payout({ id: id1, monto: 180000, estado: 'paid', llegaEn: ayer }),
    `evt_f5_${CORRIDA}_a2`,
  );

  // Cuenta que no pertenece a ningun condominio: no debe crear filas.
  await enviar(
    'payout.paid cuenta desconocida',
    'payout.paid',
    payout({
      id: `po_f5_${CORRIDA}_x`,
      monto: 10000,
      estado: 'paid',
      llegaEn: ayer,
    }),
    `evt_f5_${CORRIDA}_x1`,
    'acct_cuenta_ajena_fase5',
  );

  console.log('\nPayouts de esta corrida:', id1, id2, id3);
  console.log('Consulta: GET /api/cobros/depositos?idCondominio=2');
}

main().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(1);
});
