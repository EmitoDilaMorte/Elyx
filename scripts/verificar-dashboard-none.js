/**
 * Verificacion empirica: `dashboard: 'none'` con Stripe responsable del KYC.
 *
 * Responde, contra la cuenta de test real:
 *  1. ¿Se puede crear una cuenta v2 con dashboard 'none' y TODAS las
 *     responsabilidades en Stripe (fees, losses, requirements)?
 *  2. ¿Que responsabilidades quedan efectivamente?
 *  3. ¿Stripe pide `business_url` en Mexico? ¿Basta `product_description`?
 *  4. ¿Funciona el onboarding embebido (Account Session) sin dashboard?
 *  5. ¿El dashboard es realmente inmutable?
 *
 * Uso:
 *   docker cp scripts/verificar-dashboard-none.js elyx-backend:/app/v.js
 *   docker exec -w /app elyx-backend node v.js
 *   docker exec elyx-backend rm -f /app/v.js
 */
const Stripe = require('stripe');

const llave = process.env.STRIPE_SECRET_KEY;
if (!llave) {
  console.error('Falta STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = new Stripe(llave);

function linea(titulo) {
  console.log('\n' + '='.repeat(70));
  console.log(titulo);
  console.log('='.repeat(70));
}

async function main() {
  if (!llave.startsWith('sk_test_')) {
    console.error('ABORTADO: la llave no es de test. Este script crea cuentas.');
    process.exit(1);
  }

  // ---------------------------------------------------------------------
  linea('1. CREAR CUENTA v2 CON dashboard=none Y STRIPE 100% RESPONSABLE');
  // ---------------------------------------------------------------------
  let cuenta;
  try {
    cuenta = await stripe.v2.core.accounts.create({
      display_name: 'Verificacion dashboard none',
      contact_email: 'verificacion@elyx.mx',
      identity: {
        country: 'mx',
        entity_type: 'company',
        business_details: {
          registered_name: 'Verificacion dashboard none SA de CV',
        },
      },
      configuration: {
        merchant: {
          capabilities: { card_payments: { requested: true } },
        },
      },
      defaults: {
        currency: 'mxn',
        locales: ['es-419'],
        // Prellenado: evita que el condominio tenga que inventar una URL.
        profile: {
          product_description: 'Cobro de cuotas de mantenimiento del condominio',
        },
        responsibilities: {
          fees_collector: 'stripe',
          losses_collector: 'stripe',
          // `requirements_collector` NO se puede fijar al crear: la API lo
          // rechaza como "Unknown field". Se deriva automaticamente.
        },
      },
      dashboard: 'none',
      metadata: { prueba: 'dashboard-none' },
      include: ['configuration.merchant', 'identity', 'defaults', 'requirements'],
    });
    console.log('OK  cuenta creada:', cuenta.id);
  } catch (error) {
    console.log('FALLO al crear:', error.code ?? '', '|', error.message);
    if (error.raw && error.raw.message) {
      console.log('   detalle:', JSON.stringify(error.raw.message));
    }
    return;
  }

  // ---------------------------------------------------------------------
  linea('2. RESPONSABILIDADES EFECTIVAS Y DASHBOARD');
  // ---------------------------------------------------------------------
  console.log('dashboard            :', cuenta.dashboard);
  console.log('responsibilities     :', JSON.stringify(cuenta.defaults?.responsibilities));
  console.log('profile prellenado   :', JSON.stringify(cuenta.defaults?.profile));
  console.log('identity.entity_type :', cuenta.identity?.entity_type);
  console.log(
    'card_payments.status :',
    JSON.stringify(cuenta.configuration?.merchant?.capabilities?.card_payments),
  );

  // ---------------------------------------------------------------------
  linea('3. QUE INFORMACION PIDE STRIPE (requisitos)');
  // ---------------------------------------------------------------------
  try {
    const fresco = await stripe.v2.core.accounts.retrieve(cuenta.id, {
      include: ['requirements', 'defaults', 'configuration.merchant'],
    });

    const entradas = fresco.requirements?.entries ?? [];
    console.log('total requisitos:', entradas.length);
    for (const e of entradas) {
      console.log(
        ` - ${e.description}\n     estado=${e.minimum_deadline?.status ?? 'n/a'}`,
      );
    }

    const texto = JSON.stringify(fresco.requirements ?? {});
    console.log('\n¿pide business_url?     :', texto.includes('business_url') ? 'SI' : 'NO');
    console.log(
      '¿pide product_description?:',
      texto.includes('product_description') ? 'SI' : 'NO',
    );
  } catch (error) {
    console.log('No se pudieron leer requisitos:', error.message);
  }

  // ---------------------------------------------------------------------
  linea('4. ONBOARDING EMBEBIDO SIN DASHBOARD (Account Session v1)');
  // ---------------------------------------------------------------------
  try {
    const sesion = await stripe.accountSessions.create({
      account: cuenta.id,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
      },
    });
    console.log('OK  Account Session creada');
    console.log('    client_secret:', sesion.client_secret ? 'presente' : 'AUSENTE');
    const comps = sesion.components ?? {};
    console.log(
      '    componentes   :',
      Object.keys(comps).filter((k) => comps[k] && comps[k].enabled !== false).join(', '),
    );
    if (comps.account_onboarding) {
      console.log(
        '    onboarding.features:',
        JSON.stringify(comps.account_onboarding.features ?? null),
      );
    }
  } catch (error) {
    console.log('FALLO Account Session:', error.code ?? '', '|', error.message);
  }

  // ---------------------------------------------------------------------
  linea('5. ¿SIRVE UN ACCOUNT LINK DE ONBOARDING SIN DASHBOARD?');
  // ---------------------------------------------------------------------
  try {
    const enlace = await stripe.v2.core.accountLinks.create({
      account: cuenta.id,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          refresh_url: 'https://example.com/refresh',
          return_url: 'https://example.com/return',
          collection_options: { fields: 'eventually_due' },
        },
      },
    });
    console.log('OK  Account Link de onboarding generado');
    console.log('    url:', enlace.url ? enlace.url.slice(0, 70) + '...' : 'AUSENTE');
  } catch (error) {
    console.log('FALLO Account Link:', error.code ?? '', '|', error.message);
  }

  // ---------------------------------------------------------------------
  linea('6. ¿EL DASHBOARD ES INMUTABLE? (intento de cambiarlo a full)');
  // ---------------------------------------------------------------------
  try {
    const actualizada = await stripe.v2.core.accounts.update(cuenta.id, {
      dashboard: 'full',
    });
    console.log('CAMBIO ACEPTADO -> dashboard =', actualizada.dashboard);
    console.log('   => el dashboard NO es inmutable en la practica');
  } catch (error) {
    console.log('RECHAZADO:', error.code ?? '', '|', error.message);
    console.log('   => confirma que el dashboard es inmutable');
  }

  // ---------------------------------------------------------------------
  linea('7. ESTADO FINAL DE LA CUENTA');
  // ---------------------------------------------------------------------
  try {
    const final = await stripe.v2.core.accounts.retrieve(cuenta.id, {
      include: ['defaults', 'configuration.merchant', 'requirements'],
    });
    console.log('id        :', final.id);
    console.log('dashboard :', final.dashboard);
    console.log('responsab.:', JSON.stringify(final.defaults?.responsibilities));
    console.log(
      'card_pay. :',
      JSON.stringify(final.configuration?.merchant?.capabilities?.card_payments?.status),
    );
  } catch (error) {
    console.log('No se pudo releer:', error.message);
  }

  console.log('\nCuenta de prueba creada:', cuenta.id);
  console.log('(borrala o ignoralá: es modo test)\n');
}

main().catch((error) => {
  console.error('ERROR NO CONTROLADO:', error);
  process.exit(1);
});
