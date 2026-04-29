-- Elyx schema (multi condominium scope)

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  primer_apellido VARCHAR(80) NOT NULL,
  segundo_apellido VARCHAR(80),
  correo VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  es_superusuario BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_cambio_password BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS condominios (
  id_condominio SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  direccion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO')),
  fecha_alta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios_condominios (
  id_usuario_condominio SERIAL PRIMARY KEY,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('CONDOMINO', 'ADMINISTRADOR')),
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO')),
  fecha_alta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INT NOT NULL,
  id_condominio INT NOT NULL,
  CONSTRAINT uq_usuario_condominio UNIQUE (id_usuario, id_condominio),
  CONSTRAINT fk_usuarios_condominios_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE,
  CONSTRAINT fk_usuarios_condominios_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS unidades (
  id_unidad SERIAL PRIMARY KEY,
  clave_unidad VARCHAR(30) NOT NULL,
  tipo_unidad VARCHAR(30) NOT NULL CHECK (tipo_unidad IN ('CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO')),
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'INACTIVA')),
  fecha_alta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_condominio INT NOT NULL,
  CONSTRAINT uq_unidad_clave_por_condominio UNIQUE (id_condominio, clave_unidad),
  CONSTRAINT fk_unidades_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS unidades_ocupantes (
  id_ocupacion SERIAL PRIMARY KEY,
  tipo_ocupacion VARCHAR(20) NOT NULL CHECK (tipo_ocupacion IN ('PROPIETARIO', 'INQUILINO', 'HABITANTE')),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  id_usuario_condominio INT NOT NULL,
  id_unidad INT NOT NULL,
  CONSTRAINT fk_unidades_ocupantes_usuario_condominio
    FOREIGN KEY (id_usuario_condominio) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_unidades_ocupantes_unidad
    FOREIGN KEY (id_unidad) REFERENCES unidades(id_unidad)
    ON DELETE CASCADE,
  CONSTRAINT ck_unidades_ocupantes_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS estado_cuenta (
  id_estado_cuenta SERIAL PRIMARY KEY,
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_adeudo NUMERIC(12,2) NOT NULL DEFAULT 0,
  recargos_estimados NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_corte DATE,
  id_unidad INT NOT NULL UNIQUE,
  CONSTRAINT fk_estado_cuenta_unidad
    FOREIGN KEY (id_unidad) REFERENCES unidades(id_unidad)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS config_notificaciones (
  id_config SERIAL PRIMARY KEY,
  dias_antes INT NOT NULL DEFAULT 3 CHECK (dias_antes >= 0),
  dias_despues INT NOT NULL DEFAULT 2 CHECK (dias_despues >= 0),
  usar_email BOOLEAN NOT NULL DEFAULT TRUE,
  usar_interna BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  id_usuario_condominio INT NOT NULL UNIQUE,
  CONSTRAINT fk_config_notif_usuario_condominio
    FOREIGN KEY (id_usuario_condominio) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id_notificacion SERIAL PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN (
    'RECORDATORIO_ANTES_VENCIMIENTO',
    'RECORDATORIO_DESPUES_VENCIMIENTO',
    'SOLICITUD_CAMBIO_CREADA',
    'SOLICITUD_CAMBIO_APROBADA',
    'SOLICITUD_CAMBIO_RECHAZADA',
    'SOLICITUD_CAMBIO_EJECUTADA',
    'ALTA_INICIAL_USUARIO'
  )),
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('EMAIL', 'INTERNA')),
  asunto VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  fecha_programada TIMESTAMP NOT NULL,
  fecha_envio TIMESTAMP,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('PROGRAMADA', 'ENVIADA', 'FALLIDA', 'LEIDA')),
  id_usuario_condominio INT NOT NULL,
  id_config INT,
  CONSTRAINT fk_notif_usuario_condominio
    FOREIGN KEY (id_usuario_condominio) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_notif_config
    FOREIGN KEY (id_config) REFERENCES config_notificaciones(id_config)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cuotas (
  id_cuota SERIAL PRIMARY KEY,
  periodo VARCHAR(20) NOT NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'Cuota de mantenimiento',
  monto_base NUMERIC(12,2) NOT NULL CHECK (monto_base >= 0),
  fecha_limite DATE NOT NULL,
  recargo_por_dia NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recargo_por_dia >= 0),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'PAGADA', 'VENCIDA')),
  id_condominio INT NOT NULL,
  id_unidad INT NOT NULL,
  CONSTRAINT uq_cuota_unidad_periodo UNIQUE (id_unidad, periodo),
  CONSTRAINT fk_cuota_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_cuota_unidad
    FOREIGN KEY (id_unidad) REFERENCES unidades(id_unidad)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pagos (
  id_pago SERIAL PRIMARY KEY,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha_pago TIMESTAMP NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('CAPTURADO', 'VALIDADO', 'RECHAZADO')),
  referencia VARCHAR(120),
  motivo_rechazo TEXT,
  id_cuota INT NOT NULL UNIQUE,
  id_usuario_condominio_paga INT,
  id_usuario_condominio_admin INT,
  CONSTRAINT fk_pago_cuota
    FOREIGN KEY (id_cuota) REFERENCES cuotas(id_cuota)
    ON DELETE RESTRICT,
  CONSTRAINT fk_pago_usuario_condominio_paga
    FOREIGN KEY (id_usuario_condominio_paga) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL,
  CONSTRAINT fk_pago_usuario_condominio_admin
    FOREIGN KEY (id_usuario_condominio_admin) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evidencias_pago (
  id_evidencia SERIAL PRIMARY KEY,
  nombre_archivo VARCHAR(180) NOT NULL,
  url_archivo TEXT NOT NULL,
  fecha_carga TIMESTAMP NOT NULL,
  id_pago INT NOT NULL,
  CONSTRAINT fk_evidencia_pago
    FOREIGN KEY (id_pago) REFERENCES pagos(id_pago)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recibos (
  id_recibo SERIAL PRIMARY KEY,
  folio VARCHAR(80) NOT NULL UNIQUE,
  fecha_generacion TIMESTAMP NOT NULL,
  url_pdf TEXT NOT NULL,
  id_pago INT NOT NULL UNIQUE,
  CONSTRAINT fk_recibo_pago
    FOREIGN KEY (id_pago) REFERENCES pagos(id_pago)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reportes_mantenimiento (
  id_reporte SERIAL PRIMARY KEY,
  descripcion TEXT NOT NULL,
  fecha_reporte TIMESTAMP NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ABIERTO', 'EN_PROCESO', 'RESUELTO', 'CERRADO')),
  comentario_admin TEXT,
  id_condominio INT NOT NULL,
  id_usuario_condominio_reporta INT NOT NULL,
  id_usuario_condominio_admin INT,
  CONSTRAINT fk_rep_mant_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_rep_mant_usuario_condominio_reporta
    FOREIGN KEY (id_usuario_condominio_reporta) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE RESTRICT,
  CONSTRAINT fk_rep_mant_usuario_condominio_admin
    FOREIGN KEY (id_usuario_condominio_admin) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fotos_mantenimiento (
  id_foto SERIAL PRIMARY KEY,
  nombre_archivo VARCHAR(180) NOT NULL,
  url_archivo TEXT NOT NULL,
  fecha_carga TIMESTAMP NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('REPORTE', 'RESOLUCION')),
  id_reporte INT NOT NULL,
  CONSTRAINT fk_foto_mantenimiento_reporte
    FOREIGN KEY (id_reporte) REFERENCES reportes_mantenimiento(id_reporte)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS avisos (
  id_aviso SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  contenido TEXT NOT NULL,
  fecha_publicacion TIMESTAMP NOT NULL,
  id_condominio INT NOT NULL,
  id_usuario_condominio_admin INT NOT NULL,
  CONSTRAINT fk_aviso_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_aviso_usuario_condominio_admin
    FOREIGN KEY (id_usuario_condominio_admin) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS votaciones (
  id_votacion SERIAL PRIMARY KEY,
  pregunta TEXT NOT NULL,
  fecha_inicio TIMESTAMP NOT NULL,
  fecha_fin TIMESTAMP NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ABIERTA', 'CERRADA')),
  id_condominio INT NOT NULL,
  id_usuario_condominio_admin INT NOT NULL,
  CONSTRAINT fk_votacion_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE,
  CONSTRAINT fk_votacion_usuario_condominio_admin
    FOREIGN KEY (id_usuario_condominio_admin) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE RESTRICT,
  CONSTRAINT ck_votacion_fechas CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS votos (
  id_voto SERIAL PRIMARY KEY,
  opcion VARCHAR(100) NOT NULL,
  fecha_emision TIMESTAMP NOT NULL,
  id_votacion INT NOT NULL,
  id_usuario_condominio INT NOT NULL,
  CONSTRAINT fk_voto_votacion
    FOREIGN KEY (id_votacion) REFERENCES votaciones(id_votacion)
    ON DELETE CASCADE,
  CONSTRAINT fk_voto_usuario_condominio
    FOREIGN KEY (id_usuario_condominio) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE CASCADE,
  CONSTRAINT uq_voto_unico_por_usuario_condominio UNIQUE (id_votacion, id_usuario_condominio)
);

CREATE TABLE IF NOT EXISTS votaciones_cambio_cuota (
  id_votacion INT PRIMARY KEY,
  monto_propuesto NUMERIC(12,2) NOT NULL CHECK (monto_propuesto > 0),
  recargo_propuesto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recargo_propuesto >= 0),
  dia_limite_propuesto INT NOT NULL DEFAULT 10 CHECK (dia_limite_propuesto BETWEEN 1 AND 28),
  estado_propuesta VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_propuesta IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EJECUTADA')),
  periodo_aplicacion VARCHAR(20) NOT NULL,
  motivo TEXT,
  fecha_ejecucion TIMESTAMP,
  CONSTRAINT fk_votacion_cambio_cuota
    FOREIGN KEY (id_votacion) REFERENCES votaciones(id_votacion)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gastos (
  id_gasto SERIAL PRIMARY KEY,
  concepto VARCHAR(160) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha TIMESTAMP NOT NULL,
  proveedor VARCHAR(120),
  nota TEXT,
  url_comprobante TEXT,
  id_condominio INT NOT NULL,
  CONSTRAINT fk_gasto_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reportes_financieros (
  id_reporte_financiero SERIAL PRIMARY KEY,
  periodo VARCHAR(20) NOT NULL,
  fecha_generacion TIMESTAMP NOT NULL,
  total_ingresos NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_gastos NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_adeudos NUMERIC(14,2) NOT NULL DEFAULT 0,
  url_pdf TEXT,
  url_excel TEXT,
  id_condominio INT NOT NULL,
  CONSTRAINT uq_reporte_financiero_periodo_por_condominio UNIQUE (id_condominio, periodo),
  CONSTRAINT fk_reporte_fin_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reporte_financiero_detalle (
  id_detalle SERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  fecha TIMESTAMP NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  id_reporte_financiero INT NOT NULL,
  id_pago INT,
  id_gasto INT,
  CONSTRAINT fk_reporte_fin_det_reporte
    FOREIGN KEY (id_reporte_financiero) REFERENCES reportes_financieros(id_reporte_financiero)
    ON DELETE CASCADE,
  CONSTRAINT fk_reporte_fin_det_pago
    FOREIGN KEY (id_pago) REFERENCES pagos(id_pago)
    ON DELETE SET NULL,
  CONSTRAINT fk_reporte_fin_det_gasto
    FOREIGN KEY (id_gasto) REFERENCES gastos(id_gasto)
    ON DELETE SET NULL,
  CONSTRAINT ck_detalle_xor_pago_gasto CHECK (
    (id_pago IS NOT NULL AND id_gasto IS NULL) OR
    (id_pago IS NULL AND id_gasto IS NOT NULL)
  )
);

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
