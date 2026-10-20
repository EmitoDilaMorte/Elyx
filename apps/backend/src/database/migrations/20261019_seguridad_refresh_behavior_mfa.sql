-- Endurecimiento de sesiones (aplicar sobre bases existentes).
-- En una base nueva, infra/postgres/init/01_schema.sql ya crea todo esto.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS mfa_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_canal VARCHAR(10) NOT NULL DEFAULT 'TOTP',
  ADD COLUMN IF NOT EXISTS mfa_secreto TEXT,
  ADD COLUMN IF NOT EXISTS mfa_confirmado_en TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_usuarios_mfa_canal'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT chk_usuarios_mfa_canal
      CHECK (mfa_canal IN ('TOTP', 'EMAIL', 'AMBOS'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id_refresh SERIAL PRIMARY KEY,
  id_usuario INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  familia UUID NOT NULL,
  expira TIMESTAMPTZ NOT NULL,
  revocado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revocado_en TIMESTAMPTZ,
  ip VARCHAR(64),
  user_agent VARCHAR(255),
  CONSTRAINT fk_refresh_tokens_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_familia
  ON refresh_tokens (familia);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario
  ON refresh_tokens (id_usuario, creado_en DESC);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id_codigo SERIAL PRIMARY KEY,
  id_usuario INT NOT NULL,
  codigo_hash VARCHAR(64) NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usado_en TIMESTAMPTZ,
  CONSTRAINT fk_mfa_recovery_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_usuario
  ON mfa_recovery_codes (id_usuario, usado);

CREATE TABLE IF NOT EXISTS behavior_events (
  id_evento SERIAL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  id_usuario INT,
  ruta VARCHAR(255),
  tipo VARCHAR(32),
  payload JSONB NOT NULL,
  score INT NOT NULL DEFAULT 0,
  verdict VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ip VARCHAR(64),
  user_agent VARCHAR(255),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_behavior_events_session
  ON behavior_events (session_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_behavior_events_fecha
  ON behavior_events (creado_en DESC);
