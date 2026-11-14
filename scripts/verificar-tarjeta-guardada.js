/**
 * Verificacion de la Fase 4: tarjeta guardada con checkout embebido.
 *
 * Comprueba contra una cuenta conectada de test:
 *  1. Se puede crear un Customer DENTRO de la cuenta conectada.
 *  2. Ese Customer NO existe en la cuenta plataforma (direct charges).
 *  3. `saved_payment_method_options.payment_method_save = 'enabled'` +
 *     `payment_intent_data.setup_future_usage = 'on_session'` se aceptan con
 *     `ui_mode: 'embedded_page'` (la combinacion que usa la app).
 *  4. Una SEGUNDA sesion con el mismo `customer` tambien se crea: es lo que
 *     hace que Stripe muestre las tarjetas guardadas.
 *  5. `setup_future_usage = 'off_session'` tambien se acepta (no se usa, pero
 *     confirma que la eleccion de `on_session` es lo que evita el mandato).
 *
 * Uso:
 *   docker cp scripts/verificar-tarjeta-guardada.js elyx-backend:/app/vtg.js
 *   docker exec -w /app elyx-backend node vtg.js [acct_...]
 *   docker exec elyx-backend rm -f /app/vtg.js
 */
const Stripe = require('stripe');

const llave = process.env.STRIPE_SECRET_KEY;
if (!llave || !llave.startsWith('sk_test_')) {
  console.error('Se requiere STRIPE_SECRET_KEY de test.');
  process.exit(1);
}

const stripe = new Stripe(llave);

// Cuenta v2 creada con dashboard:'none' en la verificacion anterior.
const CUENTA = process.argv[2] || 'acct_1UanT2DMdbafSDGb';

function linea(t) {
  console.log('\n' + '='.repeat(72));
  console.log(t);
  console.log('='.repeat(72));
}

/** Sesion minima equivalente a la de una cuota, con las opciones de guardado. */
function parametrosSesion(customerId, setupFutureUsage) {
  const metadata = { origen: 'VERIFICACION', idCondominio: '0', idCuota: '0' };
  return {
    mode: 'payment',
    ui_mode: 'embedded_page',
    return_url: 'https://elyx-app.com/pagos?checkout=ok&idCuota=0',
    locale: 'es-419',
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'mxn',
          // Minimo de Stripe para MXN: $10.00 (1000 centavos).
          unit_amount: 1000,
          product_data: { name: 'Cuota de prueba', description: 'Verificacion Fase 4' },
        },
      },
    ],
    saved_payment_method_options: { payment_method_save: 'enabled' },
    payment_intent_data: {
      metadata,
      ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
    },
    metadata,
  };
}

async function main() {
  linea('0. CUENTA CONECTADA');
  try {
    const c = await stripe.v2.core.accounts.retrieve(CUENTA, { include: ['configuration.merchant'] });
    console.log('id        :', c.id);
    console.log('dashboard :', c.dashboard);
    console.log('card_payments:', JSON.stringify(c.configuration?.merchant?.capabilities?.card_payments));
  } catch (error) {
    console.error('No se pudo leer la cuenta:', error.code ?? '', '|', error.message);
    process.exit(1);
  }

  let customerId = null;
  const sesiones = [];

  linea('1. CREAR CUSTOMER EN LA CUENTA CONECTADA');
  try {
    const customer = await stripe.customers.create(
      {
        email: 'verificacion.fase4@example.com',
        name: 'Verificacion Fase 4',
        metadata: { origen: 'verificar-tarjeta-guardada' },
      },
      { stripeAccount: CUENTA },
    );
    customerId = customer.id;
    console.log('OK. Customer:', customer.id);
  } catch (error) {
    console.log('FALLO:', error.code ?? '', '|', error.message);
    process.exit(1);
  }

  linea('2. EL CUSTOMER NO DEBE EXISTIR EN LA CUENTA PLATAFORMA');
  try {
    const enPlataforma = await stripe.customers.retrieve(customerId);
    if (enPlataforma && !enPlataforma.deleted) {
      console.log('INESPERADO: el Customer tambien existe en la plataforma.');
    }
  } catch (error) {
    console.log('OK. En la plataforma responde', error.code ?? '', '(no existe ahi).');
  }

  linea('3. PRIMERA SESION: customer + payment_method_save + setup_future_usage=on_session');
  try {
    const primera = await stripe.checkout.sessions.create(
      parametrosSesion(customerId, 'on_session'),
      { stripeAccount: CUENTA },
    );
    sesiones.push(primera.id);
    console.log('OK. session:', primera.id);
    console.log('   client_secret:', primera.client_secret ? 'presente' : 'AUSENTE');
    console.log('   customer     :', primera.customer);
    console.log('   saved opts   :', JSON.stringify(primera.saved_payment_method_options));
  } catch (error) {
    console.log('FALLO:', error.code ?? '', '|', error.message);
  }

  linea('4. SEGUNDA SESION CON EL MISMO CUSTOMER (tarjetas guardadas visibles)');
  try {
    const segunda = await stripe.checkout.sessions.create(
      parametrosSesion(customerId, 'on_session'),
      { stripeAccount: CUENTA },
    );
    sesiones.push(segunda.id);
    console.log('OK. session:', segunda.id);
    console.log('   client_secret:', segunda.client_secret ? 'presente' : 'AUSENTE');
    console.log('   customer     :', segunda.customer);
  } catch (error) {
    console.log('FALLO:', error.code ?? '', '|', error.message);
  }

  linea('5. CONTROL: setup_future_usage=off_session tambien es aceptado');
  try {
    const off = await stripe.checkout.sessions.create(
      parametrosSesion(customerId, 'off_session'),
      { stripeAccount: CUENTA },
    );
    sesiones.push(off.id);
    console.log('OK. session:', off.id, '(no se usa: crearia un mandato de cobro automatico)');
  } catch (error) {
    console.log('FALLO:', error.code ?? '', '|', error.message);
  }

  linea('6. LIMPIEZA');
  for (const id of sesiones) {
    try {
      await stripe.checkout.sessions.expire(id, {}, { stripeAccount: CUENTA });
    } catch {
      /* ya expiro o no se puede expirar: no importa */
    }
  }
  if (sesiones.length > 0) {
    console.log('Sesiones de prueba expiradas:', sesiones.length);
  }
  if (customerId) {
    try {
      await stripe.customers.del(customerId, {}, { stripeAccount: CUENTA });
      console.log('Customer de prueba eliminado:', customerId);
    } catch (error) {
      console.log('No se pudo eliminar el Customer:', error.message);
    }
  }
  console.log('\nVerificacion terminada.');
}

main().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(1);
});
