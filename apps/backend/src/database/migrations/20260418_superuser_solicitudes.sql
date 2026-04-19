-- Manual migration for existing Elyx databases.
-- Apply with psql before deploying these backend changes.

ALTER TABLE IF EXISTS usuarios
  ADD COLUMN IF NOT EXISTS es_superusuario BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requiere_cambio_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS notificaciones
  DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE IF EXISTS notificaciones
  ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo IN (
    'RECORDATORIO_ANTES_VENCIMIENTO',
    'RECORDATORIO_DESPUES_VENCIMIENTO',
    'SOLICITUD_CAMBIO_CREADA',
    'SOLICITUD_CAMBIO_APROBADA',
    'SOLICITUD_CAMBIO_RECHAZADA',
    'SOLICITUD_CAMBIO_EJECUTADA',
    'ALTA_INICIAL_USUARIO'
  ));

CREATE TABLE IF NOT EXISTS solicitudes_cambio_condomino (
  id_solicitud SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL,
  id_usuario_condominio_solicitante INT NOT NULL,
  id_usuario_condominio_objetivo INT NOT NULL,
  tipo VARCHAR(40) NOT NULL CHECK (tipo IN ('BAJA_CONDOMINO', 'CAMBIO_OCUPACION', 'CAMBIO_UNIDAD')),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EJECUTADA')),
  motivo TEXT NOT NULL,
  detalle JSONB,
  id_usuario_condominio_aprobador INT,
  comentario_resolucion TEXT,
  fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_resolucion TIMESTAMP,
  fecha_ejecucion TIMESTAMP,
  CONSTRAINT fk_sol_cambio_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_sol_cambio_solicitante
    FOREIGN KEY (id_usuario_condominio_solicitante) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sol_cambio_objetivo
    FOREIGN KEY (id_usuario_condominio_objetivo) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sol_cambio_aprobador
    FOREIGN KEY (id_usuario_condominio_aprobador) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL
);
