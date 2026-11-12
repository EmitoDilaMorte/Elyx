-- ===========================================================================
-- Webhook de Connect: trazabilidad de la cuenta que origino el evento
-- ===========================================================================
--
-- Los eventos de direct charges (pago de cuotas) llegan en el scope
-- "Connected accounts" de Stripe, no en el de la cuenta plataforma. La tabla
-- `stripe_eventos` ya sirve para la idempotencia (el id de evento es unico
-- globalmente), pero sin esta columna no habia forma de saber a que condominio
-- pertenecia un evento al auditar.
--
-- `evento.account` es la fuente de verdad: identifica al condominio sin confiar
-- en la metadata, que viaja en el objeto y la controla quien crea la sesion.
--
-- Idempotente: se puede re-ejecutar sin error.

ALTER TABLE stripe_eventos
  ADD COLUMN IF NOT EXISTS cuenta_conectada VARCHAR(120);

COMMENT ON COLUMN stripe_eventos.cuenta_conectada IS
  'Cuenta conectada (acct_...) que origino el evento. NULL en eventos de la cuenta plataforma.';

CREATE INDEX IF NOT EXISTS idx_stripe_eventos_cuenta
  ON stripe_eventos (cuenta_conectada)
  WHERE cuenta_conectada IS NOT NULL;
