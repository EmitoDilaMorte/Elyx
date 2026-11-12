const Stripe = require(stripe);
const secreto = process.env.STRIPE_WEBHOOK_SECRET_CONNECT;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: 2025-10-29.clover });
const evento = {
  id: evt_guard_async_real,
  object: event,
  api_version: 2025-10-29.clover,
  created: Math.floor(Date.now() / 1000),
  type: checkout.session.async_payment_succeeded,
  account: acct_test_guard,
  data: { object: { id: cs_test_guard_3, object: checkout.session, status: complete, payment_status: paid, payment_intent: null, metadata: {} } },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
};
const payload = JSON.stringify(evento);
const firma = stripe.webhooks.generateTestHeaderString({ payload, secret: secreto });
fetch(http://localhost:3000/api/webhooks/stripe/connect, {
  method: POST,
  headers: { content-type: application/json, stripe-signature: firma },
  body: payload,
}).then(async (r) => console.log(HTTP