-- ---------------------------------------------------------------------------
-- Recargos persistidos y cobrados
-- ---------------------------------------------------------------------------
--
-- Antes `cuotas.recargo_por_dia` era una TASA diaria que solo se usaba para
-- MOSTRAR el adeudo estimado (`GET /estado-cuenta`). Ningun camino de cobro la
-- aplicaba: el pago manual, SPEI y tarjeta guardaban `cuotas.monto_base` tal
-- cual, y `marcarPagada` ponia `recargo_por_dia = 0`. Resultado: el recargo
-- devengado desaparecia al pagar y el recibo no lo podia documentar.
--
-- Ahora el recargo se cobra y se guarda:
--   - `pagos.monto`          = cuota base + recargo cobrado.
--   - `pagos.monto_recargo`  = recargo cobrado (0 si el condominio no lo cobra).
--   - `cargos_cuota.monto_cuota` conserva la base y
--     `cargos_cuota.monto_total` = monto_cuota + monto_recargo.
--
-- **Solo aplica a los condominios que configuran recargo.** El condominio que
-- deja `cuotas.recargo_por_dia = 0` sigue cobrando exactamente la cuota base:
-- el calculo da 0 y esta columna queda en 0.
--
-- **Sin backfill**: no se puede reconstruir el recargo de pagos historicos
-- porque `cuotas.recargo_por_dia` se ponia en 0 al pagar. Las filas existentes
-- quedan en 0, que es la verdad de lo que se cobro.
--
-- **Cargos vigentes congelados**: una referencia SPEI o una sesion de Stripe
-- ya entregada conserva el monto con el que se creo (el condomino pudo
-- transferir ese importe). Solo los cargos nuevos incluyen el recargo; si uno
-- expira y se regenera, se recalcula con la fecha nueva.
--
-- Idempotente: se puede re-ejecutar sin error.

BEGIN;

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS monto_recargo NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (monto_recargo >= 0);

ALTER TABLE cargos_cuota
  ADD COLUMN IF NOT EXISTS monto_recargo NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (monto_recargo >= 0);

COMMENT ON COLUMN pagos.monto IS
  'Lo que pago el condomino: cuota base + recargo. Ver monto_recargo.';
COMMENT ON COLUMN pagos.monto_recargo IS
  'Recargo por atraso cobrado en este pago. 0 si el condominio no cobra recargos.';
COMMENT ON COLUMN cargos_cuota.monto_recargo IS
  'Recargo por atraso incluido en el cobro en linea. 0 si no aplica.';
COMMENT ON COLUMN cargos_cuota.monto_total IS
  'monto_cuota + monto_recargo. Es lo que paga el condomino.';

COMMIT;
