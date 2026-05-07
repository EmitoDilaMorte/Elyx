-- Migracion: password_resets para recuperacion de contrasena
-- Fecha: Mayo 2026

CREATE TABLE IF NOT EXISTS password_resets (
  id_reset SERIAL PRIMARY KEY,
  correo VARCHAR(254) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expiracion TIMESTAMP NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
