-- Migracion: votacion de roles + suscripcion con Stripe + datos fiscales
-- Fecha: Noviembre 2026
--
-- Alcance:
--   1. `votaciones.tipo` explicito (GENERAL | CAMBIO_CUOTA | CAMBIO_ROL) + snapshot de quorum.
--   2. Tabla `votaciones_cambio_rol` para propuestas de ascenso/degradacion.
--   3. Datos fiscales del condominio (para CFDI futuro; no bloquean el registro).
--   4. Columnas de Stripe en `suscripciones_condominio` (cliente, item, dunning).
--   5. Tabla `stripe_eventos` para idempotencia de webhooks.
--
-- No toca pagos de cuotas: eso es la Idea 2.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. votaciones: tipo explicito y snapshot de quorum
-- ---------------------------------------------------------------------------

ALTER TABLE votaciones ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'GENERAL';

-- Snapshot al crear: el quorum no debe moverse si cambia el electorado despues.
ALTER TABLE votaciones ADD COLUMN IF NOT EXISTS total_habilitados INT;
ALTER TABLE votaciones ADD COLUMN IF NOT EXISTS votos_requeridos INT;

-- Backfill: las votaciones que ya tienen fila de cambio de cuota son de ese tipo.
UPDATE votaciones v
SET tipo = 'CAMBIO_CUOTA'
WHERE EXISTS (
  SELECT 1 FROM votaciones_cambio_cuota cc WHERE cc.id_votacion = v.id_votacion
);

DO $$
DECLARE
  nombre_constraint TEXT;
BEGIN
  SELECT con.conname
    INTO nombre_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'votaciones'
    AND con.contype = 'c'
    AND att.attname = 'tipo';

  IF nombre_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE votaciones DROP CONSTRAINT %I', nombre_constraint);
  END IF;
END $$;

ALTER TABLE votaciones
  ADD CONSTRAINT ck_votaciones_tipo
  CHECK (tipo IN ('GENERAL', 'CAMBIO_CUOTA', 'CAMBIO_ROL'));

-- ---------------------------------------------------------------------------
-- 2. votaciones_cambio_rol
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS votaciones_cambio_rol (
  id_votacion INT PRIMARY KEY,
  id_usuario_condominio_objetivo INT NOT NULL,
  rol_propuesto VARCHAR(20) NOT NULL
    CHECK (rol_propuesto IN ('ADMINISTRADOR', 'CONDOMINO')),
  estado_propuesta VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_propuesta IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EJECUTADA')),
  motivo TEXT,
  comentario_resolucion TEXT,
  fecha_ejecucion TIMESTAMPTZ,
  CONSTRAINT fk_votacion_cambio_rol
    FOREIGN KEY (id_votacion) REFERENCES votaciones(id_votacion)
    ON DELETE CASCADE,
  CONSTRAINT fk_votacion_cambio_rol_objetivo
    FOREIGN KEY (id_usuario_condominio_objetivo) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE RESTRICT
);

-- Una sola propuesta viva por condominio+objetivo: evita votaciones duplicadas
-- sobre la misma persona mientras una esta en curso.
CREATE UNIQUE INDEX IF NOT EXISTS uq_votacion_cambio_rol_viva
  ON votaciones_cambio_rol (id_usuario_condominio_objetivo)
  WHERE estado_propuesta = 'PENDIENTE';

-- ---------------------------------------------------------------------------
-- 3. Datos fiscales del condominio (CFDI futuro)
-- ---------------------------------------------------------------------------
-- Se capturan antes del checkout de suscripcion. NULL permitido: un condominio
-- sin suscripcion no los necesita y el registro publico no debe bloquearse.

ALTER TABLE condominios ADD COLUMN IF NOT EXISTS rfc VARCHAR(13);
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS razon_social VARCHAR(200);
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS regimen_fiscal VARCHAR(100);
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cp_fiscal VARCHAR(5);
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS correo_facturacion VARCHAR(150);

-- ---------------------------------------------------------------------------
-- 4. Suscripcion: columnas de Stripe y dunning
-- ---------------------------------------------------------------------------

-- `cus_...` de Stripe. Se reutiliza para no crear clientes duplicados.
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS proveedor_cliente_id VARCHAR(120);

-- Item de la suscripcion: obligatorio para cambiar la cantidad con prorrateo.
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(120);

ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS cancelar_al_final BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS unidades_facturadas INT;

-- Desglose de precio guardado en la suscripcion. `monto` es NETO: el IVA no es
-- ingreso de Elyx y no debe sumarse a los reportes de ingresos.
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 16;
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS precio_base NUMERIC(12,2);
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS precio_unidad NUMERIC(12,2);

-- Inicio del periodo de gracia por impago. Se limpia al confirmarse el pago.
ALTER TABLE suscripciones_condominio ADD COLUMN IF NOT EXISTS vencida_desde TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_suscripciones_vencidas
  ON suscripciones_condominio (vencida_desde)
  WHERE estado = 'VENCIDA';

-- ---------------------------------------------------------------------------
-- 5. Idempotencia de webhooks de Stripe
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stripe_eventos (
  id_evento VARCHAR(120) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  procesado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_stripe_eventos_tipo
  ON stripe_eventos (tipo, procesado_en DESC);

-- ---------------------------------------------------------------------------
-- 6. Notificaciones: nuevos tipos del flujo
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
    'DATOS_FISCALES_PENDIENTES'
  ));

COMMIT;
