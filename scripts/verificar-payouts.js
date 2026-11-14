/**
 * Verificacion previa a la implementacion de la Fase 5 (depositos/payouts)
 * y de la Fase 4 (tarjeta guardada).
 *
 * Comprueba contra cuentas de test reales:
 *  1. ¿`stripe_balance.payouts` se solicito automaticamente con `merchant`?
 *  2. ¿`stripe.payouts.list({}, { stripeAccount })` funciona con `dashboard: 'none'`?
 *  3. ¿Se puede suscribir el webhook a los eventos `payout.*`?
 *  4. ¿`saved_payment_method_options` se acepta con `ui_mode: 'embedded_page'`?
 *  5. ¿`saved_payment_method_options` se acepta con `ui_mode: 'form'`?
 *  6. ¿Se puede solicitar `link_payments` en una cuenta con `dashboard: 'none'`?
 *
 * Uso:
 *   docker cp scripts/verificar-payouts.js elyx-backend:/app/vp.js
 *   docker exec -w /app elyx-backend node vp.js
 *   docker exec elyx-backend rm -f /app/vp.js
 */
const Stripe = require('stripe');

const llave = process.env.STRIPE_SECRET_KEY;
if (!llave || !llave.startsWith('sk_test_')) {
  console.error('Se requiere STRIPE_SECRET_KEY de test.');
  process.exit(1);
}

const stripe = new Stripe(llave);

// Cuenta v2 creada en la verificacion anterior con dashboard:'none'.
const CUENTA = process.argv[2] || 'acct_1UanT2DMdbafSDGb';

function linea(t) {
  console.log('\n' + '='.repeat(72));
  console.log(t);
  console.log('='.repeat(72));
}

async function main() {
  // -------------------------------------------------------------------
  linea('0. ESTADO BASE DE LA CUENTA');
  // -------------------------------------------------------------------
  try {
    const c = await stripe.v2.core.accounts.retrieve(CUENTA, {
      include: ['configuration.merchant', 'defaults', 'requirements'],
    });
    console.log('dashboard :', c.dashboard);
    console.log('responsab.:', JSON.stringify(c.defaults?.responsibilities));
    const caps = c.configuration?.merchant?.capabilities ?? {};
    console.log('capabilities del config merchant:');
    console.log(JSON.stringify(caps, null, 2));
  } catch (error) {
    console.log('No se pudo leer la cuenta:', error.code ?? '', '|', error.message);
  }

  // -------------------------------------------------------------------
  linea('1. ¿stripe_balance.payouts SE SOLICITO AUTOMATICAMENTE?');
  // -------------------------------------------------------------------
  try {
    const c = await stripe.v2.core.accounts.retrieve(CUENTA, {
      include: ['configuration.merchant'],
    });
    const balance = c.configuration?.merchant?.capabilities?.stripe_balance;
    console.log('stripe_balance:', JSON.stringify(balance, null, 2));
    if (balance?.payouts) {
      console.log('\n=> payouts presente. status =', balance.payouts.status);
    } else {
      console.log('\n=> payouts NO aparece en la respuesta');
    }
  } catch (error) {
    console.log('Error:', error.message);
  }

  // -------------------------------------------------------------------
  linea('2. ¿LISTAR PAYOUTS DE UNA CUENTA CON dashboard:none?');
  // -------------------------------------------------------------------
  try {
    const payouts = await stripe.payouts.list({ limit: 5 }, { stripeAccount: CUENTA });
    console.log('OK. payouts devueltos:', payouts.data.length);
    for (const p of payouts.data) {
      console.log(
        `  ${p.id} | ${p.status} | ${p.amount} ${String(p.currency).toUpperCase()} | llega=${new Date(p.arrival_date * 1000).toISOString().slice(0, 10)}`,
      );
    }
    if (payouts.data.length === 0) {
      console.log('(lista vacia: la cuenta no tiene movimientos, pero la API respondio)');
    }
  } catch (error) {
    console.log('FALLO:', error.code ?? '', '|', error.message);
  }

  // ------------------------------------------------------------------
  linea('3. ¿SE PUEDE CONSULTAR EL SALDO DEL CONDOMINIO?');
  // ------------------------------------------------------------------
  try {
    // OJO: la cuenta conectada va en las OPCIONES, no en los parametros.
    // `stripe.balance.retrieve({ stripeAccount })` falla con
    // `parameter_unknown: Received unknown parameter: stripeAccount`.
    const b = await stripe.balance.retrieve({}, { stripeAccount: CUENTA });
    console.log('available:', JSON.stringify(b.available));
    console.log('pending  :', JSON.stringify(b.pending));
  } catch (error) {
    console.log('FALLO:', error.code ?? '', '|', error.message);
  }

  // -------------------------------------------------------------------
  linea('4. ¿LOS TIPOS payout.* SON VALIDOS EN EL SCOPE CONECTADO?');
  // -------------------------------------------------------------------
  try {
    const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
    console.log('webhook endpoints de la PLATAFORMA:', webhooks.data.length);
    for (const w of webhooks.data) {
      const eventos = w.enabled_events;
      console.log(`  ${w.url}`);
      console.log(`    status: ${w.status} | eventos: ${eventos.length}`);
      if (eventos.length <= 10) {
        console.log(`    ${eventos.join(', ')}`);
      }
    }
  } catch (error) {
    console.log('webhookEndpoints.list:', error.code ?? '', '|', error.message);
  }

  // Se crea un destino temporal y se borra: si algún nombre de evento no
  // existiera, Stripe lo rechazaria aqui y no en produccion.
  let destino;
  try {
    destino = await stripe.webhookEndpoints.create({
      url: 'https://elyx-app.com/api/webhooks/stripe/connect-prueba-payouts',
      enabled_events: [
        'payout.created',
        'payout.updated',
        'payout.paid',
        'payout.failed',
        'payout.reconciliation_completed',
      ],
      description: 'Verificacion temporal de eventos payout',
    });
    console.log('\nOK. los 5 tipos payout.* son aceptados:', destino.enabled_events.join(', '));
  } catch (error) {
    console.log('FALLO al validar tipos payout.*:', error.code ?? '', '|', error.message);
  } finally {
    if (destino) {
      try {
        await stripe.webhookEndpoints.del(destino.id);
        console.log('   destino temporal eliminado.');
      } catch (error) {
        console.log('   NO se pudo eliminar; borrar a mano:', destino.id);
      }
    }
  }

  // -------------------------------------------------------------------
  linea('5. CHECKOUT CON saved_payment_method_options + ui_mode=embedded_page');
  // -------------------------------------------------------------------
  let cliente;
  try {
    cliente = await stripe.customers.create(
      { email: 'verificacion@elyx.mx', description: 'Prueba guardado de tarjeta' },
      { stripeAccount: CUENTA },
    );
    console.log('Customer creado EN LA CUENTA CONECTADA:', cliente.id);
  } catch (error) {
    console.log('No se pudo crear Customer:', error.code ?? '', '|', error.message);
  }

  if (cliente) {
    const base = {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: 180000,
            product_data: { name: 'Cuota de prueba' },
          },
        },
      ],
      customer: cliente.id,
      saved_payment_method_options: { payment_method_save: 'enabled' },
    };

    for (const uiMode of ['embedded_page', 'form']) {
      try {
        const params = { ...base, ui_mode: uiMode };
        if (uiMode === 'embedded_page') {
          params.return_url = 'https://example.com/return';
        } else {
          params.return_url = 'https://example.com/return';
        }
        const s = await stripe.checkout.sessions.create(params, { stripeAccount: CUENTA });
        console.log(
          `OK  ui_mode=${uiMode} -> sesion ${s.id} | client_secret=${s.client_secret ? 'presente' : 'AUSENTE'}`,
        );
      } catch (error) {
        console.log(`FALLO ui_mode=${uiMode}: ${error.code ?? ''} | ${error.message}`);
      }
    }
  }

  // -------------------------------------------------------------------
  linea('6. ¿SE PUEDE SOLICITAR link_payments?');
  // -------------------------------------------------------------------
  try {
    await stripe.v2.core.accounts.update(CUENTA, {
      configuration: {
        merchant: {
          capabilities: {
            link_payments: { requested: true },
          },
        },
      },
    });
    const c = await stripe.v2.core.accounts.retrieve(CUENTA, {
      include: ['configuration.merchant'],
    });
    const caps = c.configuration?.merchant?.capabilities ?? {};
    console.log('OK. capabilities tras solicitar link_payments:');
    console.log('  link_payments:', JSON.stringify(caps.link_payments ?? null));
    console.log('  card_payments:', JSON.stringify(caps.card_payments?.status ?? null));
  } catch (error) {
    console.log('FALLO al solicitar link_payments:', error.code ?? '', '|', error.message);
  }

  // -------------------------------------------------------------------
  linea('7. RESUMEN');
  // -------------------------------------------------------------------
  console.log('Cuenta usada:', CUENTA);
  console.log('Customer de prueba:', cliente?.id ?? '(no creado)', '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
