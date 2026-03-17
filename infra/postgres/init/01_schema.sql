-- Elyx schema (single condominium scope)

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  primer_apellido VARCHAR(80) NOT NULL,
  segundo_apellido VARCHAR(80),
  correo VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('CONDOMINO', 'ADMINISTRADOR'))
);

CREATE TABLE IF NOT EXISTS condominos (
  id_usuario INT PRIMARY KEY,
  numero_departamento VARCHAR(20) NOT NULL,
  telefono VARCHAR(20),
  CONSTRAINT fk_condominos_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS administradores (
  id_usuario INT PRIMARY KEY,
  CONSTRAINT fk_administradores_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS estado_cuenta (
  id_estado_cuenta SERIAL PRIMARY KEY,
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_adeudo NUMERIC(12,2) NOT NULL DEFAULT 0,
  recargos_estimados NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_corte DATE,
  id_condomino INT NOT NULL UNIQUE,
  CONSTRAINT fk_estado_cuenta_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS config_notificaciones (
  id_config SERIAL PRIMARY KEY,
  dias_antes INT NOT NULL DEFAULT 3 CHECK (dias_antes >= 0),
  dias_despues INT NOT NULL DEFAULT 2 CHECK (dias_despues >= 0),
  usar_email BOOLEAN NOT NULL DEFAULT TRUE,
  usar_interna BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  id_condomino INT NOT NULL UNIQUE,
  CONSTRAINT fk_config_notif_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id_notificacion SERIAL PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('RECORDATORIO_ANTES_VENCIMIENTO', 'RECORDATORIO_DESPUES_VENCIMIENTO', 'AVISO_GENERAL')),
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('EMAIL', 'INTERNA')),
  asunto VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  fecha_programada TIMESTAMP NOT NULL,
  fecha_envio TIMESTAMP,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('PROGRAMADA', 'ENVIADA', 'FALLIDA', 'LEIDA')),
  id_condomino INT NOT NULL,
  id_config INT,
  CONSTRAINT fk_notif_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
    ON DELETE CASCADE,
  CONSTRAINT fk_notif_config
    FOREIGN KEY (id_config) REFERENCES config_notificaciones(id_config)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cuotas (
  id_cuota SERIAL PRIMARY KEY,
  periodo VARCHAR(20) NOT NULL,
  monto_base NUMERIC(12,2) NOT NULL CHECK (monto_base >= 0),
  fecha_limite DATE NOT NULL,
  recargo_por_dia NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recargo_por_dia >= 0),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'PAGADA', 'VENCIDA')),
  id_condomino INT NOT NULL,
  CONSTRAINT fk_cuota_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
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
  id_condomino INT,
  id_administrador INT,
  CONSTRAINT fk_pago_cuota
    FOREIGN KEY (id_cuota) REFERENCES cuotas(id_cuota)
    ON DELETE RESTRICT,
  CONSTRAINT fk_pago_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
    ON DELETE SET NULL,
  CONSTRAINT fk_pago_admin
    FOREIGN KEY (id_administrador) REFERENCES administradores(id_usuario)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evidencias_pago (
  id_evidencia SERIAL PRIMARY KEY,
  nombre_archivo VARCHAR(180) NOT NULL,
  url_archivo TEXT NOT NULL,
  fecha_carga TIMESTAMP NOT NULL,
  id_pago INT NOT NULL UNIQUE,
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
  id_condomino INT NOT NULL,
  id_administrador INT,
  CONSTRAINT fk_rep_mant_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
    ON DELETE CASCADE,
  CONSTRAINT fk_rep_mant_admin
    FOREIGN KEY (id_administrador) REFERENCES administradores(id_usuario)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS avisos (
  id_aviso SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  contenido TEXT NOT NULL,
  fecha_publicacion TIMESTAMP NOT NULL,
  id_administrador INT NOT NULL,
  CONSTRAINT fk_aviso_admin
    FOREIGN KEY (id_administrador) REFERENCES administradores(id_usuario)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS votaciones (
  id_votacion SERIAL PRIMARY KEY,
  pregunta TEXT NOT NULL,
  fecha_inicio TIMESTAMP NOT NULL,
  fecha_fin TIMESTAMP NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ABIERTA', 'CERRADA')),
  id_administrador INT NOT NULL,
  CONSTRAINT fk_votacion_admin
    FOREIGN KEY (id_administrador) REFERENCES administradores(id_usuario)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS votos (
  id_voto SERIAL PRIMARY KEY,
  opcion VARCHAR(100) NOT NULL,
  fecha_emision TIMESTAMP NOT NULL,
  id_votacion INT NOT NULL,
  id_condomino INT NOT NULL,
  CONSTRAINT fk_voto_votacion
    FOREIGN KEY (id_votacion) REFERENCES votaciones(id_votacion)
    ON DELETE CASCADE,
  CONSTRAINT fk_voto_condomino
    FOREIGN KEY (id_condomino) REFERENCES condominos(id_usuario)
    ON DELETE CASCADE,
  CONSTRAINT uq_voto_unico_por_condomino UNIQUE (id_votacion, id_condomino)
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
  id_administrador INT NOT NULL,
  CONSTRAINT fk_gasto_admin
    FOREIGN KEY (id_administrador) REFERENCES administradores(id_usuario)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reportes_financieros (
  id_reporte_financiero SERIAL PRIMARY KEY,
  periodo VARCHAR(20) NOT NULL UNIQUE,
  fecha_generacion TIMESTAMP NOT NULL,
  total_ingresos NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_gastos NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_adeudos NUMERIC(14,2) NOT NULL DEFAULT 0,
  url_pdf TEXT,
  url_excel TEXT,
  id_administrador INT,
  CONSTRAINT fk_reporte_fin_admin
    FOREIGN KEY (id_administrador) REFERENCES administradores(id_usuario)
    ON DELETE SET NULL
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
