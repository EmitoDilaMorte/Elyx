-- Migracion: auditoria de intentos de inicio de sesion
-- Fecha: Octubre 2026
-- Objetivo: registro permanente (forense) de intentos de login, complementario
--           a los contadores efimeros que viven en Redis.

CREATE TABLE IF NOT EXISTS intentos_login (
  id_intento SERIAL PRIMARY KEY,
  correo VARCHAR(254) NOT NULL,
  ip VARCHAR(64),
  exito BOOLEAN NOT NULL DEFAULT FALSE,
  motivo VARCHAR(200),
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intentos_login_correo_fecha
  ON intentos_login (correo, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_intentos_login_fecha
  ON intentos_login (fecha DESC);
