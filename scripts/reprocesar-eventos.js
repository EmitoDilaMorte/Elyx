/**
 * Reprocesa eventos de Stripe que ya llegaron pero no surtieron efecto.
 *
 * **Para que sirve**: cuando se corrige un bug en un manejador de webhooks, el
 * evento original ya esta guardado en `stripe_eventos` y el backend lo ignora
 * como duplicado. Volver a pagar para probar es inaceptable; este script toma
 * los payloads REALES que Stripe envio, los firma con el secreto local y los
 * reenvia al endpoint, borrando antes la fila de idempotencia.
 *
 * Se ejecuta dentro del contenedor del backend, que ya tiene `stripe`, `pg` y
 * las variables de entorno.
 *
 * Uso:
 *   docker cp scripts/reprocesar-eventos.js elyx-backend:/app/re.js
 *   docker exec -w /app elyx-backend node re.js evt_1Abc... evt_1Def...
 *   docker exec -w /app elyx-backend node re.js --tipo invoice.paid
 *   docker exec elyx-backend rm -f /app/re.js
 *
 * Sin argumentos lista los eventos recientes, sin reenviar nada.
 */
const Stripe = require('stripe');
const { Client } = require('pg');

const llave = process.env.STRIPE_SECRET_KEY;
const secreto = process.env.STRIPE_WEBHOOK_SECRET;
const conexion = process.env.DATABASE_URL;

if (!llave || !conexion) {
  console.error('Faltan STRIPE_SECRET_KEY o DATABASE_URL en el entorno.');
  process.exit(1);
}

const stripe = new Stripe(llave);
const URL_WEBHOOK = 'http://localhost:3000/api/webhooks/stripe';

/** Eventos de cuentas conectadas: van a otro endpoint y con otro secreto. */
function esDeConnect(tipo) {
  return (
    tipo.startsWith('payout.') ||
    tipo.startsWith('account.') ||
    tipo === 'checkout.session.completed' ||
    tipo.startsWith('checkout.session.async') ||
    tipo === 'checkout.session.expired'
  );
}

function endpointDe(tipo) {
  return esDeConnect(tipo)
    ? { url: 'http://localhost:3000/api/webhooks/stripe/connect', secreto: process.env.STRIPE_WEBHOOK_SECRET_CONNECT }
    : { url: URL_WEBHOOK, secreto };
}

function linea(t) {
  console.log('\n' + '='.repeat(70));
  console.log(t);
  console.log('='.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);
  const porTipo = args[0] === '--tipo' ? args[1] : null;
  const ids = porTipo ? [] : args;

  const cliente = new Client({ connectionString: conexion });
  await cliente.connect();

  try {
    let consulta;
    let parametros;
    if (ids.length > 0) {
      consulta = 'SELECT id_evento, tipo, payload FROM stripe_eventos WHERE id_evento = ANY($1::text[]) ORDER BY procesado_en';
      parametros = [ids];
    } else if (porTipo) {
      consulta = 'SELECT id_evento, tipo, payload FROM stripe_eventos WHERE tipo = $1 ORDER BY procesado_en DESC LIMIT 20';
      parametros = [porTipo];
    } else {
      consulta = 'SELECT id_evento, tipo, procesado_en FROM stripe_eventos ORDER BY procesado_en DESC LIMIT 25';
      parametros = [];
    }

    const { rows } = await cliente.query(consulta, parametros);

    if (rows.length === 0) {
      console.log('No hay eventos que coincidan.');
      return;
    }

    if (ids.length === 0 && !porTipo) {
      linea('EVENTOS RECIENTES (solo lectura)');
      for (const fila of rows) {
        console.log(`  ${fila.id_evento}  ${fila.tipo}  ${fila.procesado_en.toISOString()}`);
      }
      console.log('\nPasa ids o `--tipo <evento>` para reprocesarlos.');
      return;
    }

    for (const fila of rows) {
      linea(`REENVIANDO ${fila.tipo} (${fila.id_evento})`);

      const destino = endpointDe(fila.tipo);
      if (!destino.secreto) {
        console.log('Falta el secreto del endpoint. Se omite.');
        continue;
      }

      // Se borra la fila de idempotencia: si no, el backend responde
      // `evento-duplicado` y no ejecuta nada.
      await cliente.query('DELETE FROM stripe_eventos WHERE id_evento = $1', [fila.id_evento]);

      // El payload se serializa UNA vez y se firma exactamente ese texto: la
      // firma es sobre los bytes, no sobre el objeto.
      const cuerpo = JSON.stringify(fila.payload);
      const firma = stripe.webhooks.generateTestHeaderString({
        payload: cuerpo,
        secret: destino.secreto,
      });

      const respuesta = await fetch(destino.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': firma },
        body: cuerpo,
      });

      const texto = await respuesta.text();
      console.log(`HTTP ${respuesta.status} -> ${texto}`);
    }
  } finally {
    await cliente.end();
  }
}

main().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(1);
});
