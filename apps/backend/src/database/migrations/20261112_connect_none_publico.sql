-- ===========================================================================
-- Connect sin dashboard + pagina publica del condominio
-- ===========================================================================
--
-- Tres piezas, todas necesarias para el onboarding embebido de Stripe
-- (ver docs/decision-connect-dashboard-none.md):
--
-- 1. Datos publicos del condominio. Stripe exige que la web del negocio
--    muestre el nombre y la descripcion de los servicios, y datos de contacto
--    de atencion al cliente. Esos campos viven aqui en lugar de reutilizar los
--    del administrador: publicarlos expondria datos personales de una persona
--    fisica en una pagina abierta.
--
-- 2. Cliente de Stripe por condomino. Para no re-teclear la tarjeta en cada
--    cuota hace falta un Customer, y con direct charges ese Customer vive EN LA
--    CUENTA CONECTADA. Se mapea por membresia, no por usuario, porque la misma
--    persona puede estar en dos condominios con cuentas distintas.
--
-- 3. Depositos del condominio. Con `dashboard: 'none'` el condominio no puede
--    ver sus payouts en ningun lado; se replican aqui desde los eventos
--    payout.* del webhook de Connect.
--
-- Idempotente: se puede re-ejecutar sin error.
-- ===========================================================================

-- ===========================================================================
-- 1. Datos publicos del condominio
-- ===========================================================================

ALTER TABLE condominios
  ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(30),
  ADD COLUMN IF NOT EXISTS correo_contacto VARCHAR(150),
  ADD COLUMN IF NOT EXISTS descripcion_publica TEXT,
  -- Permite bajar la pagina publica sin revocar la cuenta de Stripe. Stripe
  -- revisa la web periodicamente: apagarla deja la cuenta sin URL valida.
  ADD COLUMN IF NOT EXISTS pagina_publica_activa BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN condominios.telefono_contacto IS
  'Telefono publico de atencion a condominos. Obligatorio para activar el cobro con tarjeta.';
COMMENT ON COLUMN condominios.correo_contacto IS
  'Correo publico de atencion a condominos. Obligatorio para activar el cobro con tarjeta.';
COMMENT ON COLUMN condominios.descripcion_publica IS
  'Descripcion de los servicios que cobra el condominio. Si es NULL se usa un texto generico.';
COMMENT ON COLUMN condominios.pagina_publica_activa IS
  'FALSE oculta /condominio/:id. Stripe necesita que la URL del negocio siga cargando.';

-- ===========================================================================
-- 2. Cliente de Stripe por membresia (tarjeta guardada)
-- ===========================================================================
--
-- Un Customer por par (condominio, membresia). El mismo usuario en otro
-- condominio usa OTRA cuenta conectada y por tanto otro Customer.
--
-- `stripe_customer_id` es UNIQUE: un Customer no puede pertenecer a dos
-- condominios. Si se duplicara, un pago de un condominio podria mostrar las
-- tarjetas de otro.

CREATE TABLE IF NOT EXISTS condominos_clientes_stripe (
  id_cliente SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL,
  id_usuario_condominio INT NOT NULL,
  stripe_customer_id VARCHAR(120) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_cliente_stripe_membresia UNIQUE (id_condominio, id_usuario_condominio),
  CONSTRAINT uq_cliente_stripe_customer UNIQUE (stripe_customer_id),
  CONSTRAINT fk_cliente_stripe_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_cliente_stripe_membresia
    FOREIGN KEY (id_usuario_condominio) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE CASCADE
);

COMMENT ON TABLE condominos_clientes_stripe IS
  'Customer de Stripe por membresia. Vive en la cuenta conectada del condominio (direct charges).';

CREATE INDEX IF NOT EXISTS idx_clientes_stripe_condominio
  ON condominos_clientes_stripe (id_condominio);

-- ===========================================================================
-- 3. Depositos del condominio (payouts de Stripe)
-- ===========================================================================
--
-- Se replica el payout para que el administrador vea en Elyx cuando y cuanto
-- le deposito Stripe, sin acceso al dashboard.
--
-- `estado` usa los valores del objeto Payout de Stripe:
--   pending   -> creado, aun no sale
--   in_transit-> enviado al banco
--   paid      -> llego a la cuenta bancaria
--   failed    -> fallo (la cuenta externa se deshabilita)
--   canceled  -> cancelado antes de enviarse

CREATE TABLE IF NOT EXISTS depositos_condominio (
  id_deposito SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL,
  stripe_payout_id VARCHAR(120) NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  estado VARCHAR(20) NOT NULL
    CHECK (estado IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  -- `standard` e `instant` en Stripe; se deja abierto por si agregan valores.
  metodo VARCHAR(20),
  -- `bank_account` o `card`.
  tipo VARCHAR(20),
  -- `arrival_date` de Stripe: cuando se espera que llegue al banco.
  llega_en DATE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_deposito_payout UNIQUE (stripe_payout_id),
  CONSTRAINT fk_deposito_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

COMMENT ON TABLE depositos_condominio IS
  'Replica de los payouts de Stripe al condominio. Se llena con los eventos payout.* del webhook de Connect.';

CREATE INDEX IF NOT EXISTS idx_depositos_condominio_fecha
  ON depositos_condominio (id_condominio, llega_en DESC);
