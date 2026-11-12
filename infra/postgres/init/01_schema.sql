-- Elyx schema (multi condominium scope)

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  primer_apellido VARCHAR(80) NOT NULL,
  segundo_apellido VARCHAR(80),
  correo VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  es_superusuario BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_cambio_password BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_canal VARCHAR(10) NOT NULL DEFAULT 'TOTP' CHECK (mfa_canal IN ('TOTP', 'EMAIL', 'AMBOS')),
  mfa_secreto TEXT,
  mfa_confirmado_en TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS condominios (
  id_condominio SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  direccion TEXT,
  -- Maximo de unidades que pueden existir (licencia). NULL = sin limite.
  cupo_unidades INT,
  -- Datos fiscales para CFDI (se piden antes de contratar; NULL = aun no capturados).
  rfc VARCHAR(13),
  razon_social VARCHAR(200),
  regimen_fiscal VARCHAR(100),
  cp_fiscal VARCHAR(5),
  correo_facturacion VARCHAR(150),
  estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO'
    CHECK (estado IN ('PENDIENTE_VERIFICACION', 'PENDIENTE_PAGO', 'ACTIVO', 'INACTIVO', 'SUSPENDIDO')),
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

-- OBSOLETA: se conserva por compatibilidad con instalaciones viejas. El saldo
-- del condomino se calcula desde `cuotas` en GET /estado-cuenta; esta tabla no
-- se lee ni se actualiza.
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
    'CUENTA_COBRO_CONFIGURADA'
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

CREATE TABLE IF NOT EXISTS cuentas_cobro_condominio (
  id_cuenta_cobro SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL UNIQUE,
  -- NINGUNO = aun no configurado (solo comprobante).
  metodo VARCHAR(20) NOT NULL DEFAULT 'NINGUNO'
    CHECK (metodo IN ('NINGUNO', 'SPEI', 'STRIPE_CONNECT')),
  -- SPEI: transferencia directa a la CLABE del condominio.
  clabe VARCHAR(18),
  banco VARCHAR(80),
  beneficiario VARCHAR(150),
  referencia_prefijo VARCHAR(12),
  -- Stripe Connect v2 (tarjeta).
  stripe_account_id VARCHAR(120),
  stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_conectado_en TIMESTAMPTZ,
  -- Meses sin intereses: apagado por defecto (cuesta 5%+ extra y lo absorbe
  -- el condominio).
  permitir_msi BOOLEAN NOT NULL DEFAULT FALSE,
  -- Comision estimada de Stripe, solo para MOSTRAR el costo en el panel.
  comision_tasa NUMERIC(5,2) NOT NULL DEFAULT 3.60,
  comision_fijo NUMERIC(12,2) NOT NULL DEFAULT 3.00,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuentas_cobro_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cargos_cuota (
  id_cargo SERIAL PRIMARY KEY,
  id_cuota INT NOT NULL,
  id_condominio INT NOT NULL,
  metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('SPEI', 'STRIPE')),
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PAGADO', 'EXPIRADO', 'CANCELADO')),
  -- `monto_total` es lo que paga el condomino: SIEMPRE igual a `monto_cuota`
  -- (la cuota no se incrementa). `monto_comision` es informativo y se llena
  -- con el dato real de Stripe al confirmar.
  monto_cuota NUMERIC(12,2) NOT NULL CHECK (monto_cuota >= 0),
  monto_comision NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_comision >= 0),
  monto_total NUMERIC(12,2) NOT NULL CHECK (monto_total >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  stripe_checkout_session_id VARCHAR(120),
  stripe_payment_intent_id VARCHAR(120),
  stripe_account_id VARCHAR(120),
  stripe_balance_transaction_id VARCHAR(120),
  referencia_spei VARCHAR(60),
  expira_en TIMESTAMPTZ,
  pagado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cargos_cuota_cuota
    FOREIGN KEY (id_cuota) REFERENCES cuotas(id_cuota)
    ON DELETE CASCADE,
  CONSTRAINT fk_cargos_cuota_condominio
    FOREIGN KEY (id_condominio) REFERENCES condominios(id_condominio)
    ON DELETE CASCADE
);

-- Un solo cargo VIGENTE por cuota; los cancelados quedan como historial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cargos_cuota_pendiente
  ON cargos_cuota (id_cuota)
  WHERE estado = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_cargos_cuota_condominio
  ON cargos_cuota (id_condominio, estado);

CREATE INDEX IF NOT EXISTS idx_cargos_cuota_spei
  ON cargos_cuota (referencia_spei)
  WHERE referencia_spei IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cargos_cuota_session_stripe
  ON cargos_cuota (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pagos (
  id_pago SERIAL PRIMARY KEY,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha_pago TIMESTAMP NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('CAPTURADO', 'VALIDADO', 'RECHAZADO')),
  referencia VARCHAR(120),
  motivo_rechazo TEXT,
  -- De donde vino el pago: comprobante subido o pasarela.
  origen VARCHAR(20) NOT NULL DEFAULT 'COMPROBANTE'
    CHECK (origen IN ('COMPROBANTE', 'STRIPE', 'SPEI')),
  id_cuota INT NOT NULL UNIQUE,
  id_usuario_condominio_paga INT,
  id_usuario_condominio_admin INT,
  id_cargo INT,
  CONSTRAINT fk_pago_cuota
    FOREIGN KEY (id_cuota) REFERENCES cuotas(id_cuota)
    ON DELETE RESTRICT,
  CONSTRAINT fk_pagos_cargo
    FOREIGN KEY (id_cargo) REFERENCES cargos_cuota(id_cargo)
    ON DELETE SET NULL,
  CONSTRAINT fk_pago_usuario_condominio_paga
    FOREIGN KEY (id_usuario_condominio_paga) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL,
  CONSTRAINT fk_pago_usuario_condominio_admin
    FOREIGN KEY (id_usuario_condominio_admin) REFERENCES usuarios_condominios(id_usuario_condominio)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_cargo
  ON pagos (id_cargo)
  WHERE id_cargo IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS password_resets (
  id_reset SERIAL PRIMARY KEY,
  correo VARCHAR(254) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expiracion TIMESTAMP NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  -- GENERAL | CAMBIO_CUOTA | CAMBIO_ROL. Antes se derivaba del JOIN con
  -- votaciones_cambio_cuota, lo que no admite un tercer tipo.
  tipo VARCHAR(20) NOT NULL DEFAULT 'GENERAL'
    CHECK (tipo IN ('GENERAL', 'CAMBIO_CUOTA', 'CAMBIO_ROL')),
  fecha_inicio TIMESTAMP NOT NULL,
  fecha_fin TIMESTAMP NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ABIERTA', 'CERRADA')),
  -- Snapshot al crear: el quorum no cambia si el electorado cambia despues.
  total_habilitados INT,
  votos_requeridos INT,
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

-- Propuesta de ascenso/degradacion de un miembro. La decision la toman los
-- condominos con unidad (no los administradores por su rol).
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

-- Una sola propuesta viva por objetivo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_votacion_cambio_rol_viva
  ON votaciones_cambio_rol (id_usuario_condominio_objetivo)
  WHERE estado_propuesta = 'PENDIENTE';

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

-- Sesiones persistentes: solo se guarda el hash del refresh token.
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

-- Codigos de recuperacion de MFA (hash, nunca el codigo en claro).
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

-- Telemetria de comportamiento (solo metadatos: nunca valores de campos).
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

-- ---------------------------------------------------------------------------
-- Registro publico de condominios ("Crea tu condominio")
-- ---------------------------------------------------------------------------

-- Alta de tenant aun no confirmada: existe solo cuando el correo no esta verificado.
CREATE TABLE IF NOT EXISTS registros_condominio (
  id_registro SERIAL PRIMARY KEY,
  nombre_condominio VARCHAR(150) NOT NULL,
  direccion_condominio TEXT,
  cupo_unidades INT NOT NULL CHECK (cupo_unidades > 0 AND cupo_unidades <= 2000),
  prefijo_unidad VARCHAR(30) NOT NULL DEFAULT '',
  tipo_unidad VARCHAR(30) NOT NULL DEFAULT 'DEPARTAMENTO'
    CHECK (tipo_unidad IN ('CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO')),
  monto_cuota NUMERIC(12,2) NOT NULL CHECK (monto_cuota >= 0),
  recargo_por_dia NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recargo_por_dia >= 0),
  dia_limite_pago INT NOT NULL DEFAULT 10 CHECK (dia_limite_pago BETWEEN 1 AND 28),
  periodo_inicial VARCHAR(20) NOT NULL,
  nombre_admin VARCHAR(100) NOT NULL,
  apellido_paterno_admin VARCHAR(80) NOT NULL,
  apellido_materno_admin VARCHAR(80),
  correo_admin VARCHAR(150) NOT NULL,
  telefono_admin VARCHAR(30),
  password_hash TEXT NOT NULL,
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

-- Link general de invitacion: el cupo son las unidades libres del condominio.
CREATE TABLE IF NOT EXISTS invitaciones_condominio (
  id_invitacion SERIAL PRIMARY KEY,
  id_condominio INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
    CHECK (estado IN ('ACTIVA', 'REVOCADA', 'EXPIRADA')),
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitaciones_activa_por_condominio
  ON invitaciones_condominio (id_condominio)
  WHERE estado = 'ACTIVA';

CREATE INDEX IF NOT EXISTS idx_invitaciones_condominio_token
  ON invitaciones_condominio (token_hash);

-- Solicitudes enviadas por los condominos: el administrador las aprueba una a una.
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_alta_unidad_viva
  ON solicitudes_alta_invitacion (id_unidad_propuesta)
  WHERE estado IN ('PENDIENTE', 'VERIFICADA');

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_alta_correo_viva
  ON solicitudes_alta_invitacion (id_condominio, LOWER(correo))
  WHERE estado IN ('PENDIENTE', 'VERIFICADA');

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_condominio
  ON solicitudes_alta_invitacion (id_condominio, estado, fecha_solicitud DESC);

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_token
  ON solicitudes_alta_invitacion (token_hash);

-- ---------------------------------------------------------------------------
-- Suscripcion a Elyx (solo activa con SUSCRIPCION_ENABLED=true)
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
  -- Identificador del cliente en el proveedor (Stripe `cus_...`).
  proveedor_cliente_id VARCHAR(120),
  -- Item de la suscripcion: obligatorio para cambiar cantidad con prorrateo.
  stripe_subscription_item_id VARCHAR(120),
  -- Un id por concepto: base (cantidad fija), unidades (cantidad variable) y
  -- ajuste al piso mensual (opcional). Cambiar la cantidad en el item base
  -- multiplicaria la cuota base, por eso se separan.
  stripe_item_base_id VARCHAR(120),
  stripe_item_unidades_id VARCHAR(120),
  stripe_item_ajuste_id VARCHAR(120),
  cancelar_al_final BOOLEAN NOT NULL DEFAULT FALSE,
  unidades_facturadas INT,
  -- `monto` es NETO. El IVA se desglosa y no es ingreso de Elyx.
  iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 16,
  precio_base NUMERIC(12,2),
  precio_unidad NUMERIC(12,2),
  -- Inicio de la gracia por impago; se limpia al confirmarse el pago.
  vencida_desde TIMESTAMPTZ,
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

CREATE INDEX IF NOT EXISTS idx_suscripciones_vencidas
  ON suscripciones_condominio (vencida_desde)
  WHERE estado = 'VENCIDA';

-- Idempotencia de webhooks de Stripe: un evento se procesa una sola vez.
CREATE TABLE IF NOT EXISTS stripe_eventos (
  id_evento VARCHAR(120) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  procesado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Cuenta conectada que origino el evento (NULL = cuenta plataforma).
  cuenta_conectada VARCHAR(120),
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_stripe_eventos_tipo
  ON stripe_eventos (tipo, procesado_en DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_eventos_cuenta
  ON stripe_eventos (cuenta_conectada)
  WHERE cuenta_conectada IS NOT NULL;

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
