-- ===========================================================================
-- Reset de la suscripcion del condominio 8 a "antes de pagar"
-- ===========================================================================
-- Objetivo: poder repetir el flujo de pago completo y comprobar que el webhook
-- vuelve a dejar la suscripcion ACTIVA.
--
-- Se limpian TODOS los campos que escribe el webhook, no solo `estado`:
-- `id_externo` apunta a la suscripcion de Stripe que ya se cancelo, y los ids
-- de los items apuntan a suscripciones de la prueba anterior. Si se dejaran,
-- el siguiente pago crearia una suscripcion nueva y las columnas quedarian
-- mezcladas entre dos suscripciones distintas.
-- ===========================================================================

-- 1. Restaurar el hash de contrasena del administrador que se corrompio al
--    intentar ponerlo desde PowerShell (`$2b` se interpreto como variable).
UPDATE usuarios
SET password_hash = '$2b$10$qmJXgOxJKoM1/YZGNbK7quBJCQQzah0fF3YUjCrEgPDfPbcp1WHTO'
WHERE id_usuario = 23;

-- 2. Suscripcion de vuelta a PENDIENTE, sin rastro de la prueba anterior.
UPDATE suscripciones_condominio
SET estado = 'PENDIENTE',
    id_externo = NULL,
    proveedor_cliente_id = NULL,
    stripe_subscription_item_id = NULL,
    stripe_item_base_id = NULL,
    stripe_item_unidades_id = NULL,
    stripe_item_ajuste_id = NULL,
    fecha_inicio = NULL,
    fecha_fin = NULL,
    vencida_desde = NULL,
    cancelar_al_final = FALSE,
    actualizado_en = NOW()
WHERE id_condominio = 8;

-- 3. Borrar los pagos de prueba para que "Total pagado" empiece en cero.
--    Son de test: no hay conciliacion contable que preservar.
DELETE FROM pagos_suscripcion WHERE id_suscripcion = 3;

-- 4. El condominio vuelve al estado en que nace al registrarse con
--    SUSCRIPCION_ENABLED=true. Sin esto quedaria ACTIVO con la suscripcion
--    pendiente, que es un estado que no existe en el flujo real.
UPDATE condominios
SET estado = 'PENDIENTE_PAGO'
WHERE id_condominio = 8;

-- 5. Verificacion.
SELECT 'suscripcion' AS tabla, estado, id_externo, fecha_fin
FROM suscripciones_condominio WHERE id_condominio = 8
UNION ALL
SELECT 'condominio', estado, NULL, NULL
FROM condominios WHERE id_condominio = 8;

SELECT COUNT(*) AS pagos_restantes FROM pagos_suscripcion WHERE id_suscripcion = 3;
