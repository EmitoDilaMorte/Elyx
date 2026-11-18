-- ---------------------------------------------------------------------------
-- Metodos de cobro independientes (SPEI y Stripe a la vez)
-- ---------------------------------------------------------------------------
--
-- Antes `cuentas_cobro_condominio.metodo` era un unico valor
-- ('NINGUNO' | 'SPEI' | 'STRIPE_CONNECT') y el servicio elegia uno u otro. Eso
-- obligaba a apagar la tarjeta para activar SPEI: en cuanto el administrador
-- guardaba su CLABE, `metodo` pasaba a 'SPEI' y desaparecia el cobro con
-- tarjeta aunque la cuenta Connect siguiera verificada.
--
-- Ahora hay una bandera por metodo y NO se limitan entre si:
--   - `spei_activo`   : el condominio ofrece transferencia (requiere CLABE).
--   - `stripe_activo` : el condominio ofrece tarjeta (requiere cuenta Connect).
-- Cada una se enciende y apaga desde el panel sin tocar la otra.
--
-- `metodo` se elimina para no dejar dos fuentes de verdad.
--
-- Idempotente: se puede re-ejecutar sin error. El backfill y el DROP solo
-- ocurren si la columna `metodo` todavia existe, asi una segunda pasada no
-- reactiva metodos que el administrador apago despues.

BEGIN;

ALTER TABLE cuentas_cobro_condominio
  ADD COLUMN IF NOT EXISTS spei_activo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_activo BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'cuentas_cobro_condominio'
      AND column_name = 'metodo'
  ) THEN
    -- Se conserva lo que ya estaba configurado: si habia CLABE se ofrecia
    -- SPEI, y si habia cuenta conectada se ofrecia tarjeta.
    UPDATE cuentas_cobro_condominio
    SET spei_activo = (clabe IS NOT NULL),
        stripe_activo = (stripe_account_id IS NOT NULL);

    ALTER TABLE cuentas_cobro_condominio DROP COLUMN metodo;
  END IF;
END $$;

COMMENT ON COLUMN cuentas_cobro_condominio.spei_activo IS
  'El condominio ofrece transferencia SPEI. Independiente de stripe_activo.';
COMMENT ON COLUMN cuentas_cobro_condominio.stripe_activo IS
  'El condominio ofrece pago con tarjeta. Independiente de spei_activo.';

COMMIT;
