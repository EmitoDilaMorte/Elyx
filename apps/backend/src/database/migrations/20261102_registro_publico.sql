-- Migracion: registro publico de condominios por administrador (Idea 1)
-- Fecha: Noviembre 2026
--
-- Alcance:
--   1. Ciclo de vida del condominio (verificacion + pago) y cupo de unidades.
--   2. Alta publica de tenants: registros_condominio.
--   3. Invitaciones por link y solicitudes de alta de condominos.
--   4. Suscripcion a Elyx con proveedor intercambiable (MANUAL/NULL por ahora).
--
-- No toca pagos de cuotas ni evidencias: eso es la Idea 2.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Condominios: cupo de unidades y estados del ciclo de vida
-- ---------------------------------------------------------------------------

-- `cupo_unidades` es el maximo de unidades que pueden EXISTIR (licencia).
-- NULL = sin limite (self-hosting o condominios creados por el superusuario).
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cupo_unidades INT;

-- El nombre del CHECK inline no es estable entre instalaciones: se localiza y
-- se elimina por columna antes de crear el nuevo.
DO $$
DECLARE
  nombre_constraint TEXT;
BEGIN
  SELECT con.conname
    INTO nombre_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'condominios'
    AND con.contype = 'c'
    AND att.attname = 'estado';

  IF nombre_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE condominios DROP CONSTRAINT %I', nombre_constraint);
  END IF;
END $$;

-- PENDIENTE_VERIFICACION tiene 22 caracteres: la columna debe crecer.
ALTER TABLE condominios ALTER COLUMN estado TYPE VARCHAR(30);
ALTER TABLE condominios ALTER COLUMN estado SET DEFAULT 'ACTIVO';

ALTER TABLE condominios
  ADD CONSTRAINT ck_condominios_estado
  CHECK (estado IN ('PENDIENTE_VERIFICACION', 'PENDIENTE_PAGO', 'ACTIVO', 'INACTIVO', 'SUSPENDIDO'));

-- ---------------------------------------------------------------------------
-- 2. Notificaciones: nuevos tipos del flujo de registro e invitaciones
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
    'INVITACION_AGOTADA'
  ));

-- ---------------------------------------------------------------------------
-- 3. Registro publico de un condominio (aun no existe el tenant)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS registros_condominio (
  id_registro SERIAL PRIMARY KEY,
  -- Datos del condominio
  nombre_condominio VARCHAR(150) NOT NULL,
  direccion_condominio TEXT,
  cupo_unidades INT NOT NULL CHECK (cupo_unidades > 0 AND cupo_unidades <= 2000),
  -- Patron para generar las unidades al verificar
  prefijo_unidad VARCHAR(30) NOT NULL DEFAULT '',
  tipo_unidad VARCHAR(30) NOT NULL DEFAULT 'DEPARTAMENTO'
    CHECK (tipo_unidad IN ('CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO')),
  -- Cuota inicial (obligatoria: no existe otro endpoint para crear cuotas)
  monto_cuota NUMERIC(12,2) NOT NULL CHECK (monto_cuota >= 0),
  recargo_por_dia NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recargo_por_dia >= 0),
  dia_limite_pago INT NOT NULL DEFAULT 10 CHECK (dia_limite_pago BETWEEN 1 AND 28),
  periodo_inicial VARCHAR(20) NOT NULL,
  -- Datos del administrador
  nombre_admin VARCHAR(100) NOT NULL,
  apellido_paterno_admin VARCHAR(80) NOT NULL,
  apellido_materno_admin VARCHAR(80),
  correo_admin VARCHAR(150) NOT NULL,
  telefono_admin VARCHAR(30),
  password_hash TEXT NOT NULL,
  -- Verificacion por correo (solo se guarda el hash del token)
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expiracion TIMESTAMPTZ NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_VERIFICACION'
    CHECK (estado IN ('PENDIENTE_VERIFICACION', 'COMPLETADO', 'EXPIRADO', 'RECHAZADO')),
  verificado_en TIMESTAMPTZ,
  id_condominio INT,
  ip VARCHAR(64),
  user_agent VARCHAR(255),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_registros_condominio_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_registros_condominio_token
  ON registros_condominio (token_hash);

CREATE INDEX IF NOT EXISTS idx_registros_condominio_correo
  ON registros_condominio (LOWER(correo_admin), estado);

CREATE INDEX IF NOT EXISTS idx_registros_condominio_pendientes
  ON registros_condominio (expiracion)
  WHERE estado = 'PENDIENTE_VERIFICACION';

-- ---------------------------------------------------------------------------
-- 4. Invitaciones por link (link general + aprobacion del administrador)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invitaciones_condominio (
  id_invitacion SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
    CHECK (estado IN ('ACTIVA', 'REVOCADA', 'EXPIRADA')),
  -- CUPO_AGOTADO, MANUAL, ROTADA, VENCIDA
  motivo_cierre VARCHAR(40),
  expiracion TIMESTAMPTZ NOT NULL,
  creada_por INT,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revocada_en TIMESTAMPTZ,
  CONSTRAINT fk_invitaciones_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_invitaciones_creada_por
    FOREIGN KEY (creada_por) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL
);

-- Solo puede existir un link activo por condominio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitaciones_activa_por_condominio
  ON invitaciones_condominio (id_condominio)
  WHERE estado = 'ACTIVA';

CREATE INDEX IF NOT EXISTS idx_invitaciones_condominio_token
  ON invitaciones_condominio (token_hash);

-- ---------------------------------------------------------------------------
-- 5. Solicitudes de alta enviadas por los condominos a traves del link
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS solicitudes_alta_invitacion (
  id_solicitud SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL,
  id_invitacion INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(80) NOT NULL,
  apellido_materno VARCHAR(80),
  correo VARCHAR(150) NOT NULL,
  -- NULL cuando la cuenta ya existe: se resuelve con magic link y sin password.
  password_hash TEXT,
  es_cuenta_existente BOOLEAN NOT NULL DEFAULT FALSE,
  telefono VARCHAR(30),
  id_unidad_propuesta INT NOT NULL,
  tipo_ocupacion VARCHAR(20) NOT NULL DEFAULT 'PROPIETARIO'
    CHECK (tipo_ocupacion IN ('PROPIETARIO', 'INQUILINO', 'HABITANTE')),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expiracion TIMESTAMPTZ NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'VERIFICADA', 'APROBADA', 'RECHAZADA', 'EXPIRADA')),
  verificado_en TIMESTAMPTZ,
  motivo_rechazo TEXT,
  revisado_por INT,
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_resolucion TIMESTAMPTZ,
  ip VARCHAR(64),
  user_agent VARCHAR(255),
  CONSTRAINT fk_solicitudes_alta_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_solicitudes_alta_invitacion
    FOREIGN KEY (id_invitacion) REFERENCES invitaciones_condominio(id_invitacion)
    ON DELETE CASCADE,
  CONSTRAINT fk_solicitudes_alta_unidad
    FOREIGN KEY (id_unidad_propuesta) REFERENCES unidades(id_unidad)
    ON DELETE RESTRICT,
  CONSTRAINT fk_solicitudes_alta_revisor
    FOREIGN KEY (revisado_por) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL
);

-- Una unidad no puede tener dos solicitudes vivas al mismo tiempo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_alta_unidad_viva
  ON solicitudes_alta_invitacion (id_unidad_propuesta)
  WHERE estado IN ('PENDIENTE', 'VERIFICADA');

-- Un correo no puede tener dos solicitudes vivas en el mismo condominio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_alta_correo_viva
  ON solicitudes_alta_invitacion (id_condominio, LOWER(correo))
  WHERE estado IN ('PENDIENTE', 'VERIFICADA');

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_condominio
  ON solicitudes_alta_invitacion (id_condominio, estado, fecha_solicitud DESC);

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_token
  ON solicitudes_alta_invitacion (token_hash);

-- ---------------------------------------------------------------------------
-- 6. Suscripcion a Elyx (opcional: SUSCRIPCION_ENABLED)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suscripciones_condominio (
  id_suscripcion SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL UNIQUE,
  plan VARCHAR(40) NOT NULL DEFAULT 'ESTANDAR',
  cupo_unidades INT,
  periodo VARCHAR(20) NOT NULL DEFAULT 'MENSUAL'
    CHECK (periodo IN ('MENSUAL', 'ANUAL')),
  monto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'ACTIVA', 'VENCIDA', 'CANCELADA')),
  proveedor VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  id_externo VARCHAR(120),
  referencia_pago VARCHAR(60),
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  renovacion_automatica BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_suscripciones_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suscripciones_estado
  ON suscripciones_condominio (estado, fecha_fin);

CREATE TABLE IF NOT EXISTS pagos_suscripcion (
  id_pago_suscripcion SERIAL PRIMARY KEY,
  id_suscripcion INT NOT NULL,
  proveedor VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  id_externo VARCHAR(120),
  referencia VARCHAR(60),
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PAGADO', 'FALLIDO', 'REEMBOLSADO')),
  metodo VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
    CHECK (metodo IN ('MANUAL', 'TRANSFERENCIA', 'CHECKOUT')),
  periodo_inicio TIMESTAMPTZ,
  periodo_fin TIMESTAMPTZ,
  -- Usuario de plataforma (superusuario) que confirmo el pago manual.
  confirmado_por INT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload JSONB,
  CONSTRAINT fk_pagos_suscripcion_suscripcion
    FOREIGN KEY (id_suscripcion) REFERENCES suscripciones_condominio(id_suscripcion)
    ON DELETE CASCADE,
  CONSTRAINT fk_pagos_suscripcion_confirmado_por
    FOREIGN KEY (confirmado_por) REFERENCES usuarios(id_usuario)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pagos_suscripcion_suscripcion
  ON pagos_suscripcion (id_suscripcion, fecha DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_suscripcion_id_externo
  ON pagos_suscripcion (proveedor, id_externo)
  WHERE id_externo IS NOT NULL;

COMMIT;
