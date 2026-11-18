-- ============================================================================
-- Sistema de notificaciones: canales, entregas por canal y Web Push
--
-- Antes de esta migracion:
--  - `notificaciones` guardaba una fila por usuario y canal declarado, pero el
--    canal nunca se respetaba: todos los INSERT del codigo eran 'INTERNA' y
--    nada enviaba correo.
--  - `estado` nacia 'PROGRAMADA' incluso para avisos inmediatos, y no existia
--    ningun proceso que lo moviera a 'ENVIADA'.
--  - No habia forma de saber si un correo se entrego, fallo o se reintento.
--
-- Modelo nuevo:
--  - `notificaciones` es la BANDEJA (una fila por usuario). `visible_en_bandeja`
--    permite que un usuario desactive la interna sin perder el correo/push.
--  - `notificacion_entregas` audita cada canal por separado, con su estado,
--    reintentos y backoff. Asi un fallo de Resend no afecta al push.
--  - `notificacion_push_suscripciones` guarda los endpoints Web Push de cada
--    dispositivo. Son por usuario-condominio, no por usuario global.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bandeja: lectura real, deduplicacion y visibilidad por canal
-- ---------------------------------------------------------------------------

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS leida_en TIMESTAMPTZ,
  -- Clave de deduplicacion para procesos automaticos (recordatorios, avisos).
  -- Postgres permite varios NULL en un UNIQUE, asi que los eventos normales
  -- no compiten por la restriccion.
  ADD COLUMN IF NOT EXISTS clave_dedupe VARCHAR(150),
  -- `false` cuando el usuario desactivo el canal interno: la fila se conserva
  -- como historial de la entrega por correo/push pero no aparece en la bandeja.
  ADD COLUMN IF NOT EXISTS visible_en_bandeja BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notificaciones_clave_dedupe
  ON notificaciones (clave_dedupe)
  WHERE clave_dedupe IS NOT NULL;

-- Indice de la bandeja: las consultas siempre filtran por usuario y ordenan
-- por fecha. Sin este indice el panel hace un scan completo por cada carga.
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_fecha
  ON notificaciones (id_usuario_condominio, fecha_programada DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_no_leidas
  ON notificaciones (id_usuario_condominio)
  WHERE estado <> 'LEIDA' AND visible_en_bandeja = TRUE;

-- Las notificaciones viejas en 'PROGRAMADA' con fecha pasada nunca se iban a
-- enviar (no habia despachador). Se marcan como enviadas para que la bandeja
-- deje de mostrar un estado imposible: existieron y se pueden leer.
UPDATE notificaciones
SET estado = 'ENVIADA',
    fecha_envio = COALESCE(fecha_envio, fecha_programada)
WHERE estado = 'PROGRAMADA'
  AND fecha_programada <= NOW();

-- ---------------------------------------------------------------------------
-- 2. Entregas por canal
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notificacion_entregas (
  id_entrega SERIAL PRIMARY KEY,
  id_notificacion INT NOT NULL,
  canal VARCHAR(10) NOT NULL CHECK (canal IN ('EMAIL', 'PUSH')),
  estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'ENVIADA', 'FALLIDA', 'OMITIDA')),
  intentos INT NOT NULL DEFAULT 0,
  proximo_intento_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Marca de reclamo: una entrega tomada por el despachador queda
  -- `EN_PROCESO` con esta fecha. Si el proceso muere, otra instancia la libera
  -- al superar el margen (ver despachador).
  reclamado_en TIMESTAMPTZ,
  enviada_en TIMESTAMPTZ,
  ultimo_error TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_notificacion_entrega_canal UNIQUE (id_notificacion, canal),
  CONSTRAINT fk_entrega_notificacion
    FOREIGN KEY (id_notificacion) REFERENCES notificaciones(id_notificacion)
    ON DELETE CASCADE
);

-- Cola de trabajo del despachador: estado + fecha de reintento.
CREATE INDEX IF NOT EXISTS idx_entregas_pendientes
  ON notificacion_entregas (canal, proximo_intento_en)
  WHERE estado IN ('PENDIENTE', 'EN_PROCESO');

-- ---------------------------------------------------------------------------
-- 3. Suscripciones Web Push
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notificacion_push_suscripciones (
  id_suscripcion SERIAL PRIMARY KEY,
  id_usuario_condominio INT NOT NULL,
  -- `endpoint` identifica el dispositivo ante el navegador. Es unico: si otra
  -- persona inicia sesion en el mismo equipo, la suscripcion se reasigna.
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(300),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_exito_en TIMESTAMPTZ,
  -- Un endpoint que falla repetidamente esta muerto: el despachador lo borra
  -- a los 5 fallos consecutivos (o al recibir 404/410 del servicio push).
  fallos_consecutivos INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_push_usuario_condominio
    FOREIGN KEY (id_usuario_condominio) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_suscripciones_usuario
  ON notificacion_push_suscripciones (id_usuario_condominio);

-- ---------------------------------------------------------------------------
-- 4. Preferencia de push
-- ---------------------------------------------------------------------------

ALTER TABLE config_notificaciones
  ADD COLUMN IF NOT EXISTS usar_push BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 5. Tipos nuevos
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
    'CARGO_CUOTA_CREADO',
    'PAGO_EN_LINEA_CONFIRMADO',
    'CARGO_CUOTA_EXPIRADO',
    'CUENTA_COBRO_CONFIGURADA',
    -- Comunicacion del condominio
    'AVISO_PUBLICADO',
    'PAGO_RECHAZADO'
  ));

COMMENT ON TABLE notificacion_entregas IS
  'Una fila por canal de una notificacion. Registra el resultado real del envio.';

COMMENT ON TABLE notificacion_push_suscripciones IS
  'Suscripciones Web Push por navegador. Se borran solas cuando el servicio push responde 404/410.';
