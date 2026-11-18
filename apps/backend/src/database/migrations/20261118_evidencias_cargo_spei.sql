-- ---------------------------------------------------------------------------
-- Comprobante de una transferencia SPEI colgado de su cargo
-- ---------------------------------------------------------------------------
--
-- Antes `evidencias_pago.id_pago` era obligatoria, asi que subir un comprobante
-- exigia que existiera un pago. Cuando el condomino ya habia generado su
-- referencia SPEI y despues subia el comprobante de la transferencia, el
-- frontend creaba un pago nuevo (CAPTURADO) solo para poder colgar el archivo.
-- El administrador terminaba viendo el mismo movimiento dos veces: la
-- transferencia por conciliar y un "pago" pendiente con la foto.
--
-- Ahora una evidencia puede colgar de:
--   - un cargo en linea (`id_cargo`): la foto de la transferencia que el
--     administrador revisa antes de confirmarla; o
--   - un pago (`id_pago`): el comprobante de un pago ya declarado.
--
-- Al confirmar la transferencia el backend reancla la evidencia al pago que se
-- crea, de modo que el archivo sigue visible en el historial.
--
-- Idempotente: se puede re-ejecutar sin error.

BEGIN;

ALTER TABLE evidencias_pago ALTER COLUMN id_pago DROP NOT NULL;

ALTER TABLE evidencias_pago
  ADD COLUMN IF NOT EXISTS id_cargo INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_evidencia_cargo'
  ) THEN
    ALTER TABLE evidencias_pago
      ADD CONSTRAINT fk_evidencia_cargo
      FOREIGN KEY (id_cargo) REFERENCES cargos_cuota(id_cargo)
      ON DELETE CASCADE;
  END IF;

  -- Una evidencia sin destino no se podria mostrar en ningun lado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_evidencia_destino'
  ) THEN
    ALTER TABLE evidencias_pago
      ADD CONSTRAINT ck_evidencia_destino
      CHECK (id_pago IS NOT NULL OR id_cargo IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidencias_cargo
  ON evidencias_pago (id_cargo)
  WHERE id_cargo IS NOT NULL;

COMMENT ON COLUMN evidencias_pago.id_cargo IS
  'Cargo en linea al que pertenece el comprobante mientras espera conciliacion. NULL si ya cuelga de un pago.';

COMMIT;
