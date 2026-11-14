/**
 * Verificacion final (Fase 6) de la cuenta conectada.
 *
 * Crea una cuenta v2 con EXACTAMENTE los mismos parametros que usa
 * `connect.service.ts` y comprueba:
 *
 *  1. `dashboard: 'none'` y las tres responsabilidades en `stripe`.
 *  2. Que `business_url` NO aparezca en `requirements.entries`: es el requisito
 *     que en Mexico bloquea el onboarding si no se prellena.
 *  3. Que las capacidades pedidas (`card_payments`, `link_payments`) existan.
 *  4. Que `accountSessions.create` con los tres componentes devuelva
 *     `client_secret` (lo que monta `ConnectOnboarding`).
 *  5. Que el Account Link de onboarding siga funcionando (camino de respaldo).
 *
 * Al final cierra la cuenta de prueba para no acumular basura en Stripe.
 *
 * Uso:
 *   docker cp scripts/verificar-cuenta-final.js elyx-backend:/app/vcf.js
 *   docker exec -w /app elyx-backend node vcf.js
 *   docker exec elyx-backend rm -f /app/vcf.js
 */
const Stripe = require('stripe');

const llave = process.env.STRIPE_SECRET_KEY;
if (!llave || !llave.startsWith('sk_test_')) {
  console.error('Se requiere STRIPE_SECRET_KEY de test.');
  process.exit(1);
}

const stripe = new Stripe(llave);

const BASE = process.env.STRIPE_BUSINESS_BASE_URL || 'https://elyx-app.com';

function linea(t) {
  console.log('\n' + '='.repeat(72));
  console.log(t);
  console.log('='.repeat(72));
}

let cuentaId = null;
let fallos = 0;

function comprobar(etiqueta, condicion, detalle) {
  if (condicion) {
    console.log(`OK   ${etiqueta}`);
  } else {
    fallos += 1;
    console.log(`FALLA ${etiqueta}${detalle ? ' -> ' + detalle : ''}`);
  }
}

async function main() {
  const idCondominio = 999001;
  const businessUrl = `${BASE.replace(/\/+$/, '')}/condominio/${idCondominio}`;

  linea('1. CREAR CUENTA CON LOS PARAMETROS REALES DE LA APP');
  const cuenta = await stripe.v2.core.accounts.create({
    display_name: 'Verificacion final Fase 6',
    contact_email: 'verificacion@elyx.mx',
    identity: {
      country: 'mx',
      entity_type: 'company',
      business_details: { registered_name: 'Verificacion final Fase 6' },
    },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
          link_payments: { requested: true },
        },
      },
    },
    defaults: {
      currency: 'mxn',
      locales: ['es-419'],
      profile: {
        business_url: businessUrl,
        product_description:
          'Administracion y cobro de cuotas de mantenimiento del condominio.',
      },
      responsibilities: {
        fees_collector: 'stripe',
        losses_collector: 'stripe',
      },
    },
    dashboard: 'none',
    metadata: { idCondominio: String(idCondominio), origen: 'verificacion-fase6' },
    include: ['configuration.merchant', 'identity', 'defaults', 'requirements'],
  });
  cuentaId = cuenta.id;
  console.log('Cuenta:', cuenta.id);
  console.log('business_url enviada:', businessUrl);

  linea('2. DASHBOARD Y RESPONSABILIDADES');
  comprobar('dashboard = none', cuenta.dashboard === 'none', cuenta.dashboard);
  const resp = cuenta.defaults?.responsibilities ?? {};
  comprobar('fees_collector = stripe', resp.fees_collector === 'stripe', resp.fees_collector);
  comprobar(
    'losses_collector = stripe',
    resp.losses_collector === 'stripe',
    resp.losses_collector,
  );
  comprobar(
    'requirements_collector = stripe',
    resp.requirements_collector === 'stripe',
    resp.requirements_collector,
  );

  linea('3. CAPACIDADES PEDIDAS');
  const caps = cuenta.configuration?.merchant?.capabilities ?? {};
  comprobar('card_payments existe', Boolean(caps.card_payments), JSON.stringify(caps.card_payments));
  comprobar('link_payments existe', Boolean(caps.link_payments), JSON.stringify(caps.link_payments));
  console.log('   (ambas quedan restricted hasta que Stripe complete el KYC)');

  linea('4. business_url NO DEBE APARECER EN requirements.entries');
  const entries = cuenta.requirements?.entries ?? [];
  console.log(`Entradas de requisitos: ${entries.length}`);
  const deUrl = entries.filter((e) => String(e.description ?? '').includes('business_url'));
  for (const e of entries) {
    console.log(
      `  - ${e.description} | awaiting_action_from=${e.awaiting_action_from} | ` +
        `deadline=${e.minimum_deadline?.status}`,
    );
  }
  comprobar(
    'ningun requisito pide business_url',
    deUrl.length === 0,
    deUrl.map((e) => e.description).join(', '),
  );

  linea('5. ACCOUNT SESSION (onboarding embebido)');
  const sesion = await stripe.accountSessions.create({
    account: cuentaId,
    components: {
      account_onboarding: { enabled: true },
      account_management: { enabled: true },
      notification_banner: { enabled: true },
    },
  });
  comprobar('devuelve client_secret', Boolean(sesion.client_secret));
  comprobar(
    'expira en el futuro',
    Boolean(sesion.expires_at) && sesion.expires_at * 1000 > Date.now(),
  );

  linea('6. ACCOUNT LINK (camino de respaldo)');
  const enlace = await stripe.accountLinks.create({
    account: cuentaId,
    type: 'account_onboarding',
    refresh_url: `${BASE.replace(/\/+$/, '')}/connect/refresh`,
    return_url: `${BASE.replace(/\/+$/, '')}/connect/return`,
    collect: 'currently_due',
  });
  comprobar('devuelve URL de Stripe', String(enlace.url).startsWith('https://'));

  linea('RESUMEN');
  console.log(fallos === 0 ? 'TODAS LAS COMPROBACIONES PASARON' : `${fallos} COMPROBACIONES FALLARON`);
}

async function limpiar() {
  if (!cuentaId) {
    return;
  }
  linea('LIMPIEZA');
  try {
    // Accounts v2 exige declarar TODAS las configuraciones aplicadas para poder
    // cerrar; sin `applied_configurations` responde `configs_must_match_to_close`.
    await stripe.v2.core.accounts.close(cuentaId, {
      applied_configurations: ['merchant'],
    });
    console.log('Cuenta de prueba cerrada:', cuentaId);
  } catch (error) {
    console.log('No se pudo cerrar la cuenta:', error.code ?? '', error.message);
  }
}

main()
  .catch((error) => {
    fallos += 1;
    console.error('Error inesperado:', error.code ?? '', error.message);
  })
  .finally(async () => {
    await limpiar();
    process.exit(fallos === 0 ? 0 : 1);
  });
