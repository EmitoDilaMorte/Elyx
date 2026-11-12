-- ===========================================================================
-- Pago de cuotas dentro de Elyx: SPEI y Stripe Connect (Idea 2)
-- Fecha: Noviembre 2026
-- ===========================================================================
--
-- Alcance:
--   1. `cuentas_cobro_condominio`: como cobra cada condominio (SPEI o Connect).
--   2. `cargos_cuota`: un cargo por cuota, con el monto desglosado.
--   3. `pagos.origen`: distinguir un comprobante de un pago en linea.
--   4. Nuevos tipos de notificacion del flujo de cobro.
--
-- Modelo de dinero (decision del proyecto):
--   - Elyx NO cobra comision por transaccion y NO custodia el dinero de las
--     cuotas. Con Stripe Connect (direct charges) el cargo se crea sobre la
--     cuenta del condominio: el dinero nunca pasa por el balance de Elyx.
--   - El condominio absorbe la comision de Stripe. La cuota NO se incrementa:
--     el condomino paga exactamente lo que debe.
--   - `monto_comision` es INFORMATIVO (dato real del balance transaction) y se
--     usa para el reporte financiero del administrador. No se cobra.
--
-- Idempotente: se puede re-ejecutar sin error (ADD COLUMN IF NOT EXISTS,
-- CREATE TABLE IF NOT EXISTS y busqueda del CHECK por columna).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Configuracion de cobro por condominio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cuentas_cobro_condominio (
  id_cuenta_cobro SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL UNIQUE,

  -- Como cobra este condominio. NINGUNO = aun no configurado (solo comprobante).
  metodo VARCHAR(20) NOT NULL DEFAULT 'NINGUNO'
    CHECK (metodo IN ('NINGUNO', 'SPEI', 'STRIPE_CONNECT')),

  -- --- SPEI (transferencia directa a la CLABE del condominio) ---
  -- La CLABE es de 18 digitos y lleva digito verificador; se valida en el
  -- servicio, no aqui, para poder devolver un mensaje accionable.
  clabe VARCHAR(18),
  banco VARCHAR(80),
  beneficiario VARCHAR(150),
  -- Prefijo de la referencia que se muestra al condomino. Se deriva del nombre
  -- si no se define, para que el estado de cuenta del banco sea legible.
  referencia_prefijo VARCHAR(12),

  -- --- Stripe Connect (tarjeta) ---
  -- `acct_...` de la cuenta conectada v2. NULL mientras no se cree.
  stripe_account_id VARCHAR(120),
  -- `active` = puede cobrar. Se sincroniza con el estado real de Stripe; una
  -- cuenta `restricted` no debe ofrecer pago con tarjeta.
  stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_conectado_en TIMESTAMPTZ,

  -- --- Interruptores y costos ---
  -- Meses sin intereses: APAGADO por defecto. Activarlo cuesta 5%+ adicional
  -- sobre la comision normal y lo absorbe el condominio.
  permitir_msi BOOLEAN NOT NULL DEFAULT FALSE,
  -- Comision estimada de Stripe, solo para MOSTRAR el costo en el panel. El
  -- monto real se guarda por cargo en `cargos_cuota.monto_comision`.
  comision_tasa NUMERIC(5,2) NOT NULL DEFAULT 3.60,
  comision_fijo NUMERIC(12,2) NOT NULL DEFAULT 3.00,

  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_cuentas_cobro_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

COMMENT ON TABLE cuentas_cobro_condominio IS
  'Como cobra cada condominio sus cuotas. Una fila por condominio.';
COMMENT ON COLUMN cuentas_cobro_condominio.comision_tasa IS
  'Comision estimada de Stripe (%). Solo para MOSTRAR el costo en el panel.';

-- ---------------------------------------------------------------------------
-- 2. Cargos por cuota (SPEI o tarjeta)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cargos_cuota (
  id_cargo SERIAL PRIMARY KEY,
  id_cuota INT NOT NULL,
  id_condominio INT NOT NULL,

  metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('SPEI', 'STRIPE')),
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PAGADO', 'EXPIRADO', 'CANCELADO')),

  -- Desglose. `monto_total` es lo que paga el condomino: SIEMPRE igual a
  -- `monto_cuota` (la cuota no se incrementa). `monto_comision` se llena con el
  -- dato real de Stripe al confirmar; en SPEI queda en 0.
  monto_cuota NUMERIC(12,2) NOT NULL CHECK (monto_cuota >= 0),
  monto_comision NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_comision >= 0),
  monto_total NUMERIC(12,2) NOT NULL CHECK (monto_total >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',

  -- --- Stripe ---
  stripe_checkout_session_id VARCHAR(120),
  stripe_payment_intent_id VARCHAR(120),
  stripe_account_id VARCHAR(120),
  -- Id del balance transaction: de ahi se lee la comision REAL cobrada.
  stripe_balance_transaction_id VARCHAR(120),

  -- --- SPEI ---
  -- Referencia que el condomino pone en el concepto de su transferencia.
  referencia_spei VARCHAR(60),

  -- Un cargo pendiente deja de servir despues de la fecha limite de la cuota
  -- mas un margen; se marca EXPIRADO por cron.
  expira_en TIMESTAMPTZ,
  pagado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_cargos_cuota_cuota
    FOREIGN KEY (id_cuota) REFERENCES cuotas(id_cuota)
    ON DELETE CASCADE,
  CONSTRAINT fk_cargos_cuota_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

-- Un solo cargo VIGENTE por cuota. Los cancelados/expirados quedan como
-- historial, por eso el indice es parcial y no un UNIQUE de columna.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cargos_cuota_pendiente
  ON cargos_cuota (id_cuota)
  WHERE estado = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_cargos_cuota_condominio
  ON cargos_cuota (id_condominio, estado);

CREATE INDEX IF NOT EXISTS idx_cargos_cuota_spei
  ON cargos_cuota (referencia_spei)
  WHERE referencia_spei IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cargos_cuota_session_stripe
  ON cargos_cuota (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON TABLE cargos_cuota IS
  'Intento de cobro de una cuota. Uno VIGENTE (PENDIENTE) por cuota; los demas quedan como historial.';

-- ---------------------------------------------------------------------------
-- 3. Origen del pago
-- ---------------------------------------------------------------------------

-- Permite distinguir un pago subido con comprobante de uno confirmado por la
-- pasarela. El flujo de validacion del administrador no cambia.
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'COMPROBANTE';

DO $$
DECLARE
  nombre_constraint TEXT;
BEGIN
  SELECT con.conname
    INTO nombre_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'pagos'
    AND con.contype = 'c'
    AND att.attname = 'origen';

  IF nombre_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pagos DROP CONSTRAINT %I', nombre_constraint);
  END IF;
END $$;

ALTER TABLE pagos
  ADD CONSTRAINT ck_pagos_origen
  CHECK (origen IN ('COMPROBANTE', 'STRIPE', 'SPEI'));

-- Enlace opcional del pago con el cargo que lo origino. UNIQUE evita que dos
-- cargos generen dos pagos sobre la misma cuota (pagos.id_cuota ya es UNIQUE).
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS id_cargo INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pagos_cargo'
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT fk_pagos_cargo
      FOREIGN KEY (id_cargo) REFERENCES cargos_cuota(id_cargo)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_cargo
  ON pagos (id_cargo)
  WHERE id_cargo IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Notificaciones del flujo de cobro
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  nombre_constraint TEXT;
BEGIN
  SELECT con.conname
    INTO nombre_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'notificaciones'
    AND con.contype = 'c'
    AND att.attname = 'tipo';

  IF nombre_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notificaciones DROP CONSTRAINT %I', nombre_constraint);
  END IF;
END $$;

ALTER TABLE notificaciones
  ADD CONSTRAINT ck_notificaciones_tipo
  CHECK (tipo IN (
    'RECORDATORIO_ANTES_VENCIMIENTO',
    'RECORDATORIO_DESPUES_VENCIMIENTO',
    'SOLICITUD_CAMBIO_CREADA',
    'SOLICITUD_CAMBIO_APROBADA',
    'SOLICITUD_CAMBIO_RECHAZADA',
    'SOLICITUD_CAMBIO_EJECUTADA',
    'ALTA_INICIAL_USUARIO',
    'SOLICITUD_ALTA_CREADA',
    'SOLICITUD_ALTA_VERIFICADA',
    'SOLICITUD_ALTA_APROBADA',
    'SOLICITUD_ALTA_RECHAZADA',
    'SUSCRIPCION_PENDIENTE',
    'SUSCRIPCION_ACTIVA',
    'INVITACION_AGOTADA',
    'VOTACION_ROL_CREADA',
    'VOTACION_ROL_RESUELTA',
    'ROL_CAMBIADO',
    'SUSCRIPCION_PAGO_FALLIDO',
    'SUSCRIPCION_SUSPENDIDA',
    'DATOS_FISCALES_PENDIENTES',
    -- Flujo de cobro de cuotas (Idea 2)
    'CARGO_CUOTA_CREADO',
    'PAGO_EN_LINEA_CONFIRMADO',
    'CARGO_CUOTA_EXPIRADO',
    'CUENTA_COBRO_CONFIGURADA'
  ));

-- ---------------------------------------------------------------------------
-- 5. `estado_cuenta` queda obsoleta
-- ---------------------------------------------------------------------------

-- Solo se insertaba al dar de alta la unidad y NUNCA se leia ni actualizaba: el
-- saldo que ve el condomino se calcula en el cliente sumando sus cuotas.
-- A partir de ahora el saldo se calcula en el servidor (GET /estado-cuenta) y
-- esta tabla deja de escribirse. No se elimina aqui para no perder el historico
-- de instalaciones viejas; se limpiara en una migracion aparte.
COMMENT ON TABLE estado_cuenta IS
  'OBSOLETA. No se lee ni se actualiza. El saldo se calcula desde `cuotas` en GET /estado-cuenta.';

COMMIT;
