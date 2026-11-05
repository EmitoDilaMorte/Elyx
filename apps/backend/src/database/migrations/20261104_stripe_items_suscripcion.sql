-- ===========================================================================
-- Items de la suscripcion de Stripe, uno por concepto
-- ===========================================================================
--
-- El cobro se arma con tres lineas como maximo:
--   0. Cuota base        (cantidad 1, precio fijo)
--   1. Unidades          (cantidad = unidades contratadas)
--   2. Ajuste a cuota minima (solo cuando aplica el piso mensual)
--
-- Guardar el id de cada item permite ajustar SOLO la linea de unidades cuando
-- el condominio cambia su numero de unidades. Antes se reutilizaba una sola
-- columna con el primer item de la suscripcion, que es la cuota base: cambiar
-- la cantidad ahi multiplicaba la cuota base por el numero de unidades.
--
-- `stripe_subscription_item_id` se conserva por compatibilidad: apunta al item
-- de unidades y queda como respaldo si las columnas nuevas estan vacias en
-- suscripciones creadas antes de esta migracion.

ALTER TABLE suscripciones_condominio
  ADD COLUMN IF NOT EXISTS stripe_item_base_id VARCHAR(120);

ALTER TABLE suscripciones_condominio
  ADD COLUMN IF NOT EXISTS stripe_item_unidades_id VARCHAR(120);

ALTER TABLE suscripciones_condominio
  ADD COLUMN IF NOT EXISTS stripe_item_ajuste_id VARCHAR(120);

COMMENT ON COLUMN suscripciones_condominio.stripe_item_base_id IS
  'Item de la cuota base fija (cantidad 1). No debe cambiar de cantidad.';
COMMENT ON COLUMN suscripciones_condominio.stripe_item_unidades_id IS
  'Item cuyo quantity es el numero de unidades contratadas.';
COMMENT ON COLUMN suscripciones_condominio.stripe_item_ajuste_id IS
  'Item de ajuste al piso mensual. Puede no existir si el piso no aplica.';
