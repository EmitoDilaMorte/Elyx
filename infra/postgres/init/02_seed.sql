-- ============================================================================
-- ELYX: Seed data para desarrollo y pruebas
-- Datos realistas con cobertura completa de todas las tablas y flujos.
-- Idempotente: se puede ejecutar múltiples veces sin error.
-- Password "password" para todos los usuarios demo.
-- ============================================================================

-- ============================================================================
-- 1. USUARIOS (14)
-- ============================================================================
INSERT INTO usuarios (id_usuario, nombre, primer_apellido, segundo_apellido, correo, password_hash, es_superusuario, requiere_cambio_password) VALUES
( 1, 'Carlos',     'Mendoza',      'García',      'superadmin@elyx.mx',        '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', TRUE,  FALSE ),
( 2, 'Ana Sofía',  'Ramírez',      'López',       'ana.ramirez@elyx.mx',       '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
( 3, 'Luis',       'Torres',       'Vega',        'luis.torres@elyx.mx',       '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
( 4, 'María José', 'Hernández',    'Díaz',        'maria.hernandez@elyx.mx',   '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, TRUE ),
( 5, 'Juan Pablo', 'Castro',       'Ruiz',        'juan.castro@gmail.com',      '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
( 6, 'Valeria',    'Ortega',       'Morales',     'valeria.ortega@outlook.com', '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
( 7, 'Diego',      'Navarro',      'Silva',       'diego.navarro@yahoo.com',    '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
( 8, 'Fernanda',   'Campos',       'Ríos',        'fernanda.campos@hotmail.com','$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
( 9, 'Ricardo',    'Ponce',        'Medina',      'ricardo.ponce@proton.me',    '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
(10, 'Paula',      'Rivas',        'Contreras',   'paula.rivas@gmail.com',      '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
(11, 'Santiago',   'Flores',       'Aguirre',     'santiago.flores@empresa.mx', '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
(12, 'Camila',     'Vallejo',      'Paredes',     'camila.vallejo@hotmail.com', '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
(13, 'Andrés',     'Guzmán',       NULL,          'andres.guzman@gmail.com',    '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
(14, 'Lucía',      'Estrada',      'Núñez',       'lucia.estrada@icloud.com',   '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE)
ON CONFLICT (id_usuario) DO UPDATE SET
  nombre = EXCLUDED.nombre, primer_apellido = EXCLUDED.primer_apellido,
  segundo_apellido = EXCLUDED.segundo_apellido, correo = EXCLUDED.correo,
  password_hash = EXCLUDED.password_hash, es_superusuario = EXCLUDED.es_superusuario,
  requiere_cambio_password = EXCLUDED.requiere_cambio_password;

-- ============================================================================
-- 2. CONDOMINIOS (3)
-- ============================================================================
INSERT INTO condominios (id_condominio, nombre, direccion, estado, fecha_alta) VALUES
(1, 'Residencial Arcos del Parque', 'Av. de los Arcos 1420, Col. Lomas del Parque, Alcaldía Miguel Hidalgo, CDMX, CP 11950', 'ACTIVO', '2021-03-15 00:00:00'),
(2, 'Condominio Jardines de la Sierra', 'Calle Sierra Nevada 355, Col. Vista Hermosa, Zapopan, Jalisco, CP 45130', 'ACTIVO', '2020-08-01 00:00:00'),
(3, 'Plaza Comercial del Valle', 'Blvd. del Valle 780, Col. Centro Comercial, San Pedro Garza García, N.L., CP 64720', 'ACTIVO', '2019-01-10 00:00:00')
ON CONFLICT (id_condominio) DO UPDATE SET
  nombre = EXCLUDED.nombre, direccion = EXCLUDED.direccion, estado = EXCLUDED.estado;

-- ============================================================================
-- 3. USUARIOS_CONDOMINIOS (16 membresías)
-- ============================================================================
INSERT INTO usuarios_condominios (id_usuario_condominio, rol, estado, id_usuario, id_condominio, fecha_alta) VALUES
( 1, 'ADMINISTRADOR', 'ACTIVO',  2, 1, '2021-06-01 00:00:00'),
( 2, 'CONDOMINO',     'ACTIVO',  5, 1, '2023-06-01 00:00:00'),
( 3, 'CONDOMINO',     'ACTIVO',  6, 1, '2025-08-01 00:00:00'),
( 4, 'CONDOMINO',     'ACTIVO',  7, 1, '2023-03-15 00:00:00'),
( 5, 'CONDOMINO',     'ACTIVO', 13, 1, '2026-02-01 00:00:00'),
( 6, 'ADMINISTRADOR', 'ACTIVO',  3, 2, '2020-09-01 00:00:00'),
( 7, 'CONDOMINO',     'ACTIVO',  8, 2, '2022-11-01 00:00:00'),
( 8, 'CONDOMINO',     'ACTIVO',  9, 2, '2023-08-01 00:00:00'),
( 9, 'CONDOMINO',     'ACTIVO', 10, 2, '2025-07-15 00:00:00'),
(10, 'CONDOMINO',     'ACTIVO', 14, 2, '2024-02-01 00:00:00'),
(11, 'CONDOMINO',     'ACTIVO',  5, 2, '2024-09-01 00:00:00'),
(12, 'ADMINISTRADOR', 'ACTIVO',  4, 3, '2019-02-01 00:00:00'),
(13, 'CONDOMINO',     'ACTIVO', 11, 3, '2022-01-15 00:00:00'),
(14, 'CONDOMINO',     'ACTIVO', 12, 3, '2022-06-01 00:00:00'),
(15, 'CONDOMINO',     'ACTIVO', 14, 3, '2026-03-01 00:00:00'),
(16, 'CONDOMINO',     'ACTIVO',  7, 3, '2025-04-01 00:00:00')
ON CONFLICT (id_usuario_condominio) DO UPDATE SET
  rol = EXCLUDED.rol, estado = EXCLUDED.estado,
  id_usuario = EXCLUDED.id_usuario, id_condominio = EXCLUDED.id_condominio;

-- ============================================================================
-- 4. UNIDADES (16)
-- ============================================================================
INSERT INTO unidades (id_unidad, clave_unidad, tipo_unidad, estado, id_condominio) VALUES
( 1, 'A-101', 'DEPARTAMENTO', 'ACTIVA', 1),
( 2, 'A-102', 'DEPARTAMENTO', 'ACTIVA', 1),
( 3, 'A-201', 'DEPARTAMENTO', 'ACTIVA', 1),
( 4, 'A-202', 'DEPARTAMENTO', 'ACTIVA', 1),
( 5, 'A-301', 'DEPARTAMENTO', 'ACTIVA', 1),
( 6, 'A-302', 'DEPARTAMENTO', 'ACTIVA', 1),
( 7, 'B-101', 'CASA',         'ACTIVA', 2),
( 8, 'B-102', 'CASA',         'ACTIVA', 2),
( 9, 'B-201', 'CASA',         'ACTIVA', 2),
(10, 'B-202', 'CASA',         'ACTIVA', 2),
(11, 'B-301', 'CASA',         'ACTIVA', 2),
(12, 'L-101', 'LOCAL',        'ACTIVA', 3),
(13, 'L-102', 'LOCAL',        'ACTIVA', 3),
(14, 'D-201', 'DEPARTAMENTO', 'ACTIVA', 3),
(15, 'D-202', 'DEPARTAMENTO', 'ACTIVA', 3),
(16, 'D-301', 'DEPARTAMENTO', 'ACTIVA', 3)
ON CONFLICT (id_unidad) DO UPDATE SET
  clave_unidad = EXCLUDED.clave_unidad, tipo_unidad = EXCLUDED.tipo_unidad,
  estado = EXCLUDED.estado, id_condominio = EXCLUDED.id_condominio;

-- ============================================================================
-- 5. UNIDADES_OCUPANTES (13)
-- ============================================================================
INSERT INTO unidades_ocupantes (id_ocupacion, tipo_ocupacion, fecha_inicio, fecha_fin, id_usuario_condominio, id_unidad) VALUES
( 1, 'PROPIETARIO', '2023-06-01', NULL,          2,  1),
( 2, 'INQUILINO',   '2025-08-01', '2026-12-31',   3,  2),
( 3, 'PROPIETARIO', '2023-03-15', NULL,           4,  3),
( 4, 'INQUILINO',   '2026-02-01', '2027-01-31',   5,  4),
( 5, 'PROPIETARIO', '2022-11-01', NULL,           7,  7),
( 6, 'PROPIETARIO', '2023-08-01', NULL,           8,  8),
( 7, 'INQUILINO',   '2025-07-15', '2026-12-31',   9,  9),
( 8, 'PROPIETARIO', '2024-02-01', NULL,          10, 10),
( 9, 'PROPIETARIO', '2024-09-01', NULL,          11, 11),
(10, 'PROPIETARIO', '2022-01-15', NULL,          13, 12),
(11, 'PROPIETARIO', '2022-06-01', NULL,          14, 13),
(12, 'INQUILINO',   '2026-03-01', '2027-02-28',  15, 14),
(13, 'PROPIETARIO', '2025-04-01', NULL,          16, 16)
ON CONFLICT (id_ocupacion) DO UPDATE SET
  tipo_ocupacion = EXCLUDED.tipo_ocupacion, fecha_inicio = EXCLUDED.fecha_inicio,
  fecha_fin = EXCLUDED.fecha_fin, id_usuario_condominio = EXCLUDED.id_usuario_condominio,
  id_unidad = EXCLUDED.id_unidad;


-- ============================================================================
-- 6. ESTADO_CUENTA (16)
-- ============================================================================
INSERT INTO estado_cuenta (id_estado_cuenta, saldo_actual, total_adeudo, recargos_estimados, fecha_corte, id_unidad) VALUES
( 1, 0.00,   4400.00,     0.00, '2026-04-30',  1),
( 2, 0.00,  10150.00,  1350.00, '2026-04-30',  2),
( 3, 0.00,   2200.00,     0.00, '2026-04-30',  3),
( 4, 0.00,   6600.00,     0.00, '2026-04-30',  4),
( 5, 0.00,   6600.00,  3150.00, '2026-04-30',  5),
( 6, 0.00,   2200.00,  1305.00, '2026-04-30',  6),
( 7, 0.00,   3600.00,     0.00, '2026-04-30',  7),
( 8, 0.00,   5400.00,   420.00, '2026-04-30',  8),
( 9, 0.00,   5400.00,   140.00, '2026-04-30',  9),
(10, 0.00,   3600.00,     0.00, '2026-04-30', 10),
(11, 0.00,   9000.00,  1050.00, '2026-04-30', 11),
(12, 0.00,   5600.00,     0.00, '2026-04-30', 12),
(13, 0.00,   8400.00,  1920.00, '2026-04-30', 13),
(14, 0.00,   5000.00,     0.00, '2026-04-30', 14),
(15, 0.00,   7500.00,  1680.00, '2026-04-30', 15),
(16, 0.00,   2500.00,     0.00, '2026-04-30', 16)
ON CONFLICT (id_unidad) DO UPDATE SET
  saldo_actual = EXCLUDED.saldo_actual, total_adeudo = EXCLUDED.total_adeudo,
  recargos_estimados = EXCLUDED.recargos_estimados, fecha_corte = EXCLUDED.fecha_corte;

-- ============================================================================
-- 7. CONFIG_NOTIFICACIONES (16)
-- ============================================================================
INSERT INTO config_notificaciones (id_config, dias_antes, dias_despues, usar_email, usar_interna, activo, id_usuario_condominio) VALUES
( 1, 5, 3, TRUE,  TRUE,  TRUE,  1),
( 2, 3, 2, TRUE,  TRUE,  TRUE,  2),
( 3, 7, 5, TRUE,  FALSE, TRUE,  3),
( 4, 2, 1, FALSE, TRUE,  TRUE,  4),
( 5, 3, 2, TRUE,  TRUE,  TRUE,  5),
( 6, 5, 3, TRUE,  TRUE,  TRUE,  6),
( 7, 3, 2, TRUE,  TRUE,  TRUE,  7),
( 8, 3, 2, TRUE,  TRUE,  TRUE,  8),
( 9, 5, 2, TRUE,  FALSE, TRUE,  9),
(10, 3, 2, TRUE,  TRUE,  TRUE, 10),
(11, 3, 2, FALSE, TRUE,  TRUE, 11),
(12, 3, 2, TRUE,  TRUE,  TRUE, 12),
(13, 5, 3, TRUE,  TRUE,  TRUE, 13),
(14, 3, 2, TRUE,  TRUE,  FALSE,14),
(15, 3, 2, TRUE,  TRUE,  TRUE, 15),
(16, 2, 1, FALSE, TRUE,  TRUE, 16)
ON CONFLICT (id_usuario_condominio) DO UPDATE SET
  dias_antes = EXCLUDED.dias_antes, dias_despues = EXCLUDED.dias_despues,
  usar_email = EXCLUDED.usar_email, usar_interna = EXCLUDED.usar_interna,
  activo = EXCLUDED.activo;

-- ============================================================================
-- 8. CUOTAS (68)
-- ============================================================================
INSERT INTO cuotas (id_cuota, periodo, tipo, monto_base, fecha_limite, recargo_por_dia, estado, id_condominio, id_unidad) VALUES
-- Cond 1: monto $2,200, recargo $45/día, límite día 20
( 1, '2026-01', 'Cuota de mantenimiento', 2200.00, '2026-01-20', 45.00, 'PAGADA',    1, 1),
( 2, '2026-02', 'Cuota de mantenimiento', 2200.00, '2026-02-20', 45.00, 'PAGADA',    1, 1),
( 3, '2026-03', 'Cuota de mantenimiento', 2200.00, '2026-03-20', 45.00, 'PAGADA',    1, 1),
( 4, '2026-04', 'Cuota de mantenimiento', 2200.00, '2026-04-20', 45.00, 'PENDIENTE', 1, 1),
( 5, '2026-05', 'Cuota de mantenimiento', 2200.00, '2026-05-20', 45.00, 'PENDIENTE', 1, 1),
( 6, '2026-01', 'Cuota de mantenimiento', 2200.00, '2026-01-20', 45.00, 'PAGADA',    1, 2),
( 7, '2026-02', 'Cuota de mantenimiento', 2200.00, '2026-02-20', 45.00, 'VENCIDA',   1, 2),
( 8, '2026-03', 'Cuota de mantenimiento', 2200.00, '2026-03-20', 45.00, 'PENDIENTE', 1, 2),
( 9, '2026-04', 'Cuota de mantenimiento', 2200.00, '2026-04-20', 45.00, 'PENDIENTE', 1, 2),
(10, '2026-05', 'Cuota de mantenimiento', 2200.00, '2026-05-20', 45.00, 'PENDIENTE', 1, 2),
(11, '2026-01', 'Cuota de mantenimiento', 2200.00, '2026-01-20', 45.00, 'PAGADA',    1, 3),
(12, '2026-02', 'Cuota de mantenimiento', 2200.00, '2026-02-20', 45.00, 'PAGADA',    1, 3),
(13, '2026-03', 'Cuota de mantenimiento', 2200.00, '2026-03-20', 45.00, 'PAGADA',    1, 3),
(14, '2026-04', 'Cuota de mantenimiento', 2200.00, '2026-04-20', 45.00, 'PAGADA',    1, 3),
(15, '2026-05', 'Cuota de mantenimiento', 2200.00, '2026-05-20', 45.00, 'PENDIENTE', 1, 3),
(16, '2026-03', 'Cuota de mantenimiento', 2200.00, '2026-03-20', 45.00, 'PENDIENTE', 1, 4),
(17, '2026-04', 'Cuota de mantenimiento', 2200.00, '2026-04-20', 45.00, 'PENDIENTE', 1, 4),
(18, '2026-05', 'Cuota de mantenimiento', 2200.00, '2026-05-20', 45.00, 'PENDIENTE', 1, 4),
(19, '2026-01', 'Cuota de mantenimiento', 2200.00, '2026-01-20', 45.00, 'VENCIDA',   1, 5),
(20, '2026-02', 'Cuota de mantenimiento', 2200.00, '2026-02-20', 45.00, 'VENCIDA',   1, 5),
(21, '2026-03', 'Cuota de mantenimiento', 2200.00, '2026-03-20', 45.00, 'PENDIENTE', 1, 5),
(22, '2026-01', 'Cuota de mantenimiento', 2200.00, '2026-01-20', 45.00, 'VENCIDA',   1, 6),
-- Cond 2: monto $1,800, recargo $35/día
(23, '2026-01', 'Cuota de mantenimiento', 1800.00, '2026-01-20', 35.00, 'PAGADA',    2, 7),
(24, '2026-02', 'Cuota de mantenimiento', 1800.00, '2026-02-20', 35.00, 'PAGADA',    2, 7),
(25, '2026-03', 'Cuota de mantenimiento', 1800.00, '2026-03-20', 35.00, 'PAGADA',    2, 7),
(26, '2026-04', 'Cuota de mantenimiento', 1800.00, '2026-04-20', 35.00, 'PENDIENTE', 2, 7),
(27, '2026-05', 'Cuota de mantenimiento', 1800.00, '2026-05-20', 35.00, 'PENDIENTE', 2, 7),
(28, '2026-01', 'Cuota de mantenimiento', 1800.00, '2026-01-20', 35.00, 'PAGADA',    2, 8),
(29, '2026-02', 'Cuota de mantenimiento', 1800.00, '2026-02-20', 35.00, 'PAGADA',    2, 8),
(30, '2026-03', 'Cuota de mantenimiento', 1800.00, '2026-03-20', 35.00, 'VENCIDA',   2, 8),
(31, '2026-04', 'Cuota de mantenimiento', 1800.00, '2026-04-20', 35.00, 'PENDIENTE', 2, 8),
(32, '2026-05', 'Cuota de mantenimiento', 1800.00, '2026-05-20', 35.00, 'PENDIENTE', 2, 8),
(33, '2026-01', 'Cuota de mantenimiento', 1800.00, '2026-01-20', 35.00, 'PAGADA',    2, 9),
(34, '2026-02', 'Cuota de mantenimiento', 1800.00, '2026-02-20', 35.00, 'PAGADA',    2, 9),
(35, '2026-03', 'Cuota de mantenimiento', 1800.00, '2026-03-20', 35.00, 'PENDIENTE', 2, 9),
(36, '2026-04', 'Cuota de mantenimiento', 1800.00, '2026-04-20', 35.00, 'PENDIENTE', 2, 9),
(37, '2026-05', 'Cuota de mantenimiento', 1800.00, '2026-05-20', 35.00, 'PENDIENTE', 2, 9),
(38, '2026-01', 'Cuota de mantenimiento', 1800.00, '2026-01-20', 35.00, 'PAGADA',    2, 10),
(39, '2026-02', 'Cuota de mantenimiento', 1800.00, '2026-02-20', 35.00, 'PAGADA',    2, 10),
(40, '2026-03', 'Cuota de mantenimiento', 1800.00, '2026-03-20', 35.00, 'PAGADA',    2, 10),
(41, '2026-04', 'Cuota de mantenimiento', 1800.00, '2026-04-20', 35.00, 'PENDIENTE', 2, 10),
(42, '2026-05', 'Cuota de mantenimiento', 1800.00, '2026-05-20', 35.00, 'PENDIENTE', 2, 10),
(43, '2026-01', 'Cuota de mantenimiento', 1800.00, '2026-01-20', 35.00, 'VENCIDA',   2, 11),
(44, '2026-02', 'Cuota de mantenimiento', 1800.00, '2026-02-20', 35.00, 'VENCIDA',   2, 11),
(45, '2026-03', 'Cuota de mantenimiento', 1800.00, '2026-03-20', 35.00, 'PENDIENTE', 2, 11),
(46, '2026-04', 'Cuota de mantenimiento', 1800.00, '2026-04-20', 35.00, 'PENDIENTE', 2, 11),
(47, '2026-05', 'Cuota de mantenimiento', 1800.00, '2026-05-20', 35.00, 'PENDIENTE', 2, 11),
-- Cond 3: locales $2,800, deptos $2,500, recargo $60/día
(48, '2026-01', 'Cuota de mantenimiento', 2800.00, '2026-01-20', 60.00, 'PAGADA',    3, 12),
(49, '2026-02', 'Cuota de mantenimiento', 2800.00, '2026-02-20', 60.00, 'PAGADA',    3, 12),
(50, '2026-03', 'Cuota de mantenimiento', 2800.00, '2026-03-20', 60.00, 'PAGADA',    3, 12),
(51, '2026-04', 'Cuota de mantenimiento', 2800.00, '2026-04-20', 60.00, 'PENDIENTE', 3, 12),
(52, '2026-05', 'Cuota de mantenimiento', 2800.00, '2026-05-20', 60.00, 'PENDIENTE', 3, 12),
(53, '2026-01', 'Cuota de mantenimiento', 2800.00, '2026-01-20', 60.00, 'VENCIDA',   3, 13),
(54, '2026-02', 'Cuota de mantenimiento', 2800.00, '2026-02-20', 60.00, 'VENCIDA',   3, 13),
(55, '2026-03', 'Cuota de mantenimiento', 2800.00, '2026-03-20', 60.00, 'PAGADA',    3, 13),
(56, '2026-04', 'Cuota de mantenimiento', 2800.00, '2026-04-20', 60.00, 'PENDIENTE', 3, 13),
(57, '2026-05', 'Cuota de mantenimiento', 2800.00, '2026-05-20', 60.00, 'PENDIENTE', 3, 13),
(58, '2026-03', 'Cuota de mantenimiento', 2500.00, '2026-03-20', 60.00, 'PAGADA',    3, 14),
(59, '2026-04', 'Cuota de mantenimiento', 2500.00, '2026-04-20', 60.00, 'PENDIENTE', 3, 14),
(60, '2026-05', 'Cuota de mantenimiento', 2500.00, '2026-05-20', 60.00, 'PENDIENTE', 3, 14),
(61, '2026-01', 'Cuota de mantenimiento', 2500.00, '2026-01-20', 60.00, 'VENCIDA',   3, 15),
(62, '2026-02', 'Cuota de mantenimiento', 2500.00, '2026-02-20', 60.00, 'VENCIDA',   3, 15),
(63, '2026-03', 'Cuota de mantenimiento', 2500.00, '2026-03-20', 60.00, 'PENDIENTE', 3, 15),
(64, '2026-01', 'Cuota de mantenimiento', 2500.00, '2026-01-20', 60.00, 'PAGADA',    3, 16),
(65, '2026-02', 'Cuota de mantenimiento', 2500.00, '2026-02-20', 60.00, 'PAGADA',    3, 16),
(66, '2026-03', 'Cuota de mantenimiento', 2500.00, '2026-03-20', 60.00, 'PAGADA',    3, 16),
(67, '2026-04', 'Cuota de mantenimiento', 2500.00, '2026-04-20', 60.00, 'PAGADA',    3, 16),
(68, '2026-05', 'Cuota de mantenimiento', 2500.00, '2026-05-20', 60.00, 'PENDIENTE', 3, 16)
ON CONFLICT (id_cuota) DO UPDATE SET
  periodo = EXCLUDED.periodo, tipo = EXCLUDED.tipo, monto_base = EXCLUDED.monto_base,
  fecha_limite = EXCLUDED.fecha_limite, recargo_por_dia = EXCLUDED.recargo_por_dia,
  estado = EXCLUDED.estado, id_condominio = EXCLUDED.id_condominio, id_unidad = EXCLUDED.id_unidad;


-- ============================================================================
-- 9. PAGOS (27)
-- ============================================================================
INSERT INTO pagos (id_pago, monto, fecha_pago, estado, referencia, motivo_rechazo, id_cuota, id_usuario_condominio_paga, id_usuario_condominio_admin) VALUES
-- Cond 1
( 1, 2200.00, '2026-01-18 10:30:00', 'VALIDADO',  'REF-20260118-001', NULL,  1,  2,  1),
( 2, 2200.00, '2026-02-19 14:15:00', 'VALIDADO',  'REF-20260219-001', NULL,  2,  2,  1),
( 3, 2200.00, '2026-03-19 09:45:00', 'CAPTURADO', 'REF-20260319-005', NULL,  3,  2, NULL),
( 6, 2200.00, '2026-01-17 11:00:00', 'VALIDADO',  'REF-20260117-003', NULL,  6,  3,  1),
( 7, 1500.00, '2026-02-22 16:20:00', 'RECHAZADO', 'REF-20260222-007', 'Monto insuficiente: se recibieron $1,500.00 de $2,200.00. Favor de cubrir la diferencia.', 7, 3, 1),
(11, 2200.00, '2026-01-15 08:30:00', 'VALIDADO',  'REF-20260115-002', NULL, 11,  4,  1),
(12, 2200.00, '2026-02-18 10:10:00', 'VALIDADO',  'REF-20260218-003', NULL, 12,  4,  1),
(13, 2200.00, '2026-03-17 12:00:00', 'VALIDADO',  'REF-20260317-001', NULL, 13,  4,  1),
(14, 2200.00, '2026-04-19 15:30:00', 'CAPTURADO', 'REF-20260419-002', NULL, 14,  4, NULL),
-- Cond 2
(23, 1800.00, '2026-01-16 09:00:00', 'VALIDADO',  'DEP-20260116-01',  NULL, 23,  7,  6),
(24, 1800.00, '2026-02-18 11:20:00', 'VALIDADO',  'DEP-20260218-02',  NULL, 24,  7,  6),
(25, 1800.00, '2026-03-18 13:40:00', 'CAPTURADO', 'DEP-20260318-03',  NULL, 25,  7, NULL),
(28, 1800.00, '2026-01-20 17:00:00', 'VALIDADO',  'TRANS-20260120-05',NULL, 28,  8,  6),
(29, 1800.00, '2026-02-20 09:30:00', 'VALIDADO',  'TRANS-20260220-05',NULL, 29,  8,  6),
(33, 1800.00, '2026-01-13 10:15:00', 'VALIDADO',  'OX-20260113-001',  NULL, 33,  9,  6),
(34, 1800.00, '2026-02-21 15:45:00', 'CAPTURADO', 'OX-20260221-002',  NULL, 34,  9, NULL),
(38, 1800.00, '2026-01-14 08:50:00', 'VALIDADO',  'DEP-20260114-09',  NULL, 38, 10,  6),
(39, 1800.00, '2026-02-16 11:10:00', 'VALIDADO',  'DEP-20260216-09',  NULL, 39, 10,  6),
(40, 1800.00, '2026-03-17 16:25:00', 'VALIDADO',  'DEP-20260317-09',  NULL, 40, 10,  6),
-- Cond 3
(48, 2800.00, '2026-01-17 10:05:00', 'VALIDADO',  'SPEI-260117-0041', NULL, 48, 13, 12),
(49, 2800.00, '2026-02-17 09:35:00', 'VALIDADO',  'SPEI-260217-0052', NULL, 49, 13, 12),
(50, 2800.00, '2026-03-19 14:50:00', 'CAPTURADO', 'SPEI-260319-0063', NULL, 50, 13, NULL),
(55, 2800.00, '2026-03-21 11:30:00', 'CAPTURADO', 'DEP-260321-1001',  NULL, 55, 14, NULL),
(58, 2500.00, '2026-03-18 12:15:00', 'VALIDADO',  'TRF-260318-0501',  NULL, 58, 15, 12),
(64, 2500.00, '2026-01-15 08:00:00', 'VALIDADO',  'SPEI-260115-0301', NULL, 64, 16, 12),
(65, 2500.00, '2026-02-17 09:20:00', 'VALIDADO',  'SPEI-260217-0301', NULL, 65, 16, 12),
(66, 2500.00, '2026-03-16 11:45:00', 'VALIDADO',  'SPEI-260316-0301', NULL, 66, 16, 12),
(67, 2500.00, '2026-04-18 15:10:00', 'CAPTURADO', 'SPEI-260418-0301', NULL, 67, 16, NULL)
ON CONFLICT (id_pago) DO UPDATE SET
  monto = EXCLUDED.monto, fecha_pago = EXCLUDED.fecha_pago, estado = EXCLUDED.estado,
  referencia = EXCLUDED.referencia, motivo_rechazo = EXCLUDED.motivo_rechazo,
  id_cuota = EXCLUDED.id_cuota, id_usuario_condominio_paga = EXCLUDED.id_usuario_condominio_paga,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

-- ============================================================================
-- 10. EVIDENCIAS_PAGO (8)
-- ============================================================================
INSERT INTO evidencias_pago (id_evidencia, nombre_archivo, url_archivo, fecha_carga, id_pago) VALUES
(1, 'comprobante_marzo_jpablo.pdf', '/uploads/evidencias/cond1/2026-03-19_comprobante_jpablo.pdf', '2026-03-19 09:50:00',  3),
(2, 'comprobante_feb_valeria.png',   '/uploads/evidencias/cond1/2026-02-22_pago_valeria.png',   '2026-02-22 16:25:00',  7),
(3, 'comprobante_abril_diego.pdf',   '/uploads/evidencias/cond1/2026-04-19_comprobante_diego.pdf','2026-04-19 15:35:00', 14),
(4, 'transferencia_marzo_fernanda.pdf','/uploads/evidencias/cond2/2026-03-18_trans_fernanda.pdf','2026-03-18 13:50:00', 25),
(5, 'oxxo_feb_paula.png',           '/uploads/evidencias/cond2/2026-02-21_oxxo_paula.png',     '2026-02-21 15:50:00', 34),
(6, 'spei_mar_santiago.pdf',        '/uploads/evidencias/cond3/2026-03-19_spei_santiago.pdf',  '2026-03-19 14:55:00', 50),
(7, 'dep_mar_camila.pdf',           '/uploads/evidencias/cond3/2026-03-21_deposito_camila.pdf','2026-03-21 11:35:00', 55),
(8, 'spei_abr_diego.pdf',           '/uploads/evidencias/cond3/2026-04-18_spei_diego.pdf',     '2026-04-18 15:15:00', 67)
ON CONFLICT (id_evidencia) DO UPDATE SET
  nombre_archivo = EXCLUDED.nombre_archivo, url_archivo = EXCLUDED.url_archivo,
  fecha_carga = EXCLUDED.fecha_carga, id_pago = EXCLUDED.id_pago;

-- ============================================================================
-- 11. RECIBOS (20, solo para pagos VALIDADOS)
-- ============================================================================
INSERT INTO recibos (id_recibo, folio, fecha_generacion, url_pdf, id_pago) VALUES
( 1, 'ELY-REC-2026-00001', '2026-01-19 10:00:00', '/recibos/cond1/recibo_00001.pdf',  1),
( 2, 'ELY-REC-2026-00002', '2026-02-20 10:00:00', '/recibos/cond1/recibo_00002.pdf',  2),
( 3, 'ELY-REC-2026-00003', '2026-01-18 10:00:00', '/recibos/cond1/recibo_00003.pdf',  6),
( 4, 'ELY-REC-2026-00004', '2026-01-16 10:00:00', '/recibos/cond1/recibo_00004.pdf', 11),
( 5, 'ELY-REC-2026-00005', '2026-02-19 10:00:00', '/recibos/cond1/recibo_00005.pdf', 12),
( 6, 'ELY-REC-2026-00006', '2026-03-18 10:00:00', '/recibos/cond1/recibo_00006.pdf', 13),
( 7, 'ELY-REC-2026-00007', '2026-01-17 10:00:00', '/recibos/cond2/recibo_00007.pdf', 23),
( 8, 'ELY-REC-2026-00008', '2026-02-19 10:00:00', '/recibos/cond2/recibo_00008.pdf', 24),
( 9, 'ELY-REC-2026-00009', '2026-01-21 10:00:00', '/recibos/cond2/recibo_00009.pdf', 28),
(10, 'ELY-REC-2026-00010', '2026-02-21 10:00:00', '/recibos/cond2/recibo_00010.pdf', 29),
(11, 'ELY-REC-2026-00011', '2026-01-14 10:00:00', '/recibos/cond2/recibo_00011.pdf', 33),
(12, 'ELY-REC-2026-00012', '2026-01-15 10:00:00', '/recibos/cond2/recibo_00012.pdf', 38),
(13, 'ELY-REC-2026-00013', '2026-02-17 10:00:00', '/recibos/cond2/recibo_00013.pdf', 39),
(14, 'ELY-REC-2026-00014', '2026-03-18 10:00:00', '/recibos/cond2/recibo_00014.pdf', 40),
(15, 'ELY-REC-2026-00015', '2026-01-18 10:00:00', '/recibos/cond3/recibo_00015.pdf', 48),
(16, 'ELY-REC-2026-00016', '2026-02-18 10:00:00', '/recibos/cond3/recibo_00016.pdf', 49),
(17, 'ELY-REC-2026-00017', '2026-03-19 10:00:00', '/recibos/cond3/recibo_00017.pdf', 58),
(18, 'ELY-REC-2026-00018', '2026-01-16 10:00:00', '/recibos/cond3/recibo_00018.pdf', 64),
(19, 'ELY-REC-2026-00019', '2026-02-18 10:00:00', '/recibos/cond3/recibo_00019.pdf', 65),
(20, 'ELY-REC-2026-00020', '2026-03-17 10:00:00', '/recibos/cond3/recibo_00020.pdf', 66)
ON CONFLICT (id_recibo) DO UPDATE SET
  folio = EXCLUDED.folio, fecha_generacion = EXCLUDED.fecha_generacion,
  url_pdf = EXCLUDED.url_pdf, id_pago = EXCLUDED.id_pago;


-- ============================================================================
-- 12. AVISOS (15)
-- ============================================================================
INSERT INTO avisos (id_aviso, titulo, contenido, fecha_publicacion, id_condominio, id_usuario_condominio_admin) VALUES
( 1, 'Corte programado de agua por mantenimiento de cisterna',
      'El próximo jueves 23 de abril se realizará limpieza y desinfección de la cisterna general. El suministro de agua se suspenderá de 09:00 a 14:00 hrs. Favor de tomar precauciones.',
      '2026-04-16 09:00:00', 1, 1),
( 2, 'Asamblea General Ordinaria — Mayo 2026',
      'Se convoca a todos los condóminos a la Asamblea General Ordinaria que se celebrará el sábado 15 de mayo a las 11:00 hrs en el salón de usos múltiples. Puntos a tratar: 1) Lectura del acta anterior, 2) Informe financiero del primer trimestre 2026, 3) Propuesta de incremento a cuota de mantenimiento, 4) Asuntos generales.',
      '2026-04-22 10:30:00', 1, 1),
( 3, 'Fumigación general en áreas comunes y departamentos',
      'El lunes 9 de marzo se realizará fumigación contra cucarachas y hormigas en todas las áreas comunes. Departamentos que deseen servicio puerta a puerta deberán registrarse con administración antes del viernes 6 de marzo. Costo por departamento: $350.00.',
      '2026-02-25 09:00:00', 1, 1),
( 4, 'Recordatorio: pago de cuota antes del día 20',
      'Se recuerda a todos los vecinos que la fecha límite para el pago de la cuota de mantenimiento es el día 20 de cada mes. A partir del día 21 se genera un recargo de $45.00 por día de atraso. Pueden realizar su pago por transferencia a la CLABE 012180001122334455 o en la administración de 09:00 a 14:00 hrs.',
      '2026-03-10 08:00:00', 1, 1),
( 5, 'Nuevo reglamento de uso de áreas comunes',
      'A partir del 1 de febrero entra en vigor el nuevo reglamento de uso de áreas comunes. Cambios principales: reservación del salón de usos múltiples con 48 hrs de anticipación ($500 de depósito reembolsable), horario de alberca de 08:00 a 21:00 hrs, y límite de 4 invitados por departamento en áreas recreativas. El reglamento completo está disponible en la administración.',
      '2026-01-18 11:00:00', 1, 1),
( 6, 'Instalación de cámaras de seguridad en perímetro',
      'La próxima semana inicia la instalación de 8 nuevas cámaras de seguridad HD en el perímetro del condominio. Los trabajos no afectarán suministro eléctrico ni conectividad. Se agradecerá no obstruir las zonas de instalación señalizadas.',
      '2026-04-01 10:00:00', 2, 6),
( 7, 'Mantenimiento de áreas verdes — cierre parcial de jardines',
      'Del lunes 20 al miércoles 22 de abril, el jardín central y el área de asadores permanecerán cerrados por labores de poda, fertilización y reemplazo de césped. El acceso peatonal por la calle principal no se verá afectado.',
      '2026-04-15 09:30:00', 2, 6),
( 8, 'Cambio de empresa de seguridad — GuardPro inicia operaciones',
      'A partir del 1 de abril, GuardPro S.A. de C.V. será la nueva encargada de la seguridad del condominio, en sustitución de Seguridad VIP. Se solicita a todos los residentes registrar sus datos biométricos durante la primera semana de abril en la caseta de acceso.',
      '2026-03-26 12:00:00', 2, 6),
( 9, 'Colecta vecinal: apoyo a damnificados por inundaciones',
      'La administración en coordinación con el comité vecinal organiza una colecta de víveres no perecederos, ropa en buen estado y artículos de limpieza para apoyar a las familias afectadas por las recientes inundaciones en la zona sur del estado. Centro de acopio en caseta de vigilancia del 25 al 31 de enero.',
      '2026-01-22 14:00:00', 2, 6),
(10, 'Resultados de la auditoría financiera 2025',
      'Ya están disponibles los resultados de la auditoría financiera del ejercicio 2025, realizada por ContaPlus Consultores. El dictamen fue favorable sin observaciones. El informe completo puede consultarse en la oficina de administración de 10:00 a 14:00 hrs.',
      '2026-02-10 09:00:00', 2, 6),
(11, 'Renovación de fachada principal',
      'Del 4 al 15 de mayo se realizarán trabajos de renovación de fachada principal (pintura, impermeabilización y cambio de letreros corporativos). Los accesos peatonales y vehiculares no se verán interrumpidos, pero se recomienda usar el acceso lateral durante el periodo de obra.',
      '2026-04-27 13:00:00', 3, 12),
(12, 'Nuevo horario de estacionamiento de visitas',
      'A partir del 1 de marzo, el estacionamiento de visitas operará con tickets digitales: primeras 2 horas gratis, de 2 a 5 horas $25.00/hora, más de 5 horas tarifa máxima de $120.00. Los locatarios pueden solicitar tickets de cortesía en la administración.',
      '2026-02-18 10:00:00', 3, 12),
(13, 'Simulacro de protección civil — 19 de febrero',
      'El miércoles 19 de febrero a las 11:00 hrs se llevará a cabo el simulacro trimestral de protección civil (sismo). Se solicita la participación de todos los locatarios, empleados y residentes. Duración aproximada: 20 minutos. Puntos de reunión: estacionamientos norte y sur.',
      '2026-02-08 09:00:00', 3, 12),
(14, 'Actualización de póliza de seguro contra incendio',
      'Se ha renovado la póliza de seguro contra incendio y riesgos catastróficos del inmueble para 2026 con GNP Seguros. La suma asegurada se incrementó en un 8%. Los certificados individuales están disponibles en formato digital: administracion@plazadelvalle.mx.',
      '2026-01-28 11:30:00', 3, 12),
(15, 'Convocatoria: elección de representantes 2026-2027',
      'Se abre convocatoria para la elección de los nuevos representantes del comité de condóminos para el periodo 2026-2027. Las planillas deberán registrarse antes del 15 de enero. La votación se realizará del 20 al 30 de enero en la administración de 09:00 a 16:00 hrs.',
      '2026-01-05 10:00:00', 3, 12)
ON CONFLICT (id_aviso) DO UPDATE SET
  titulo = EXCLUDED.titulo, contenido = EXCLUDED.contenido,
  fecha_publicacion = EXCLUDED.fecha_publicacion, id_condominio = EXCLUDED.id_condominio,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

-- ============================================================================
-- 13. VOTACIONES (9)
-- ============================================================================
INSERT INTO votaciones (id_votacion, pregunta, fecha_inicio, fecha_fin, estado, id_condominio, id_usuario_condominio_admin) VALUES
(1, '¿Aprueba el presupuesto trimestral de jardinería por $18,500.00 para mantenimiento de áreas verdes (poda, fertilización y control de plagas) correspondiente al periodo abril-junio 2026?',
    '2026-03-01 00:00:00', '2026-04-30 23:59:59', 'ABIERTA', 1, 1),
(2, '¿Está de acuerdo con la instalación de paneles solares en la azotea del edificio para alimentar las áreas comunes? Inversión total: $280,000.00 a cubrirse mediante cuota extraordinaria única de $3,500.00 por departamento.',
    '2026-01-15 00:00:00', '2026-02-15 23:59:59', 'CERRADA', 1, 1),
(3, '¿Aprueba el cambio de proveedor de limpieza de Grupo Fénix a BrillaMax S.A. de C.V. con un costo mensual de $15,200.00 (incremento de $800.00 respecto al contrato actual)?',
    '2025-12-01 00:00:00', '2025-12-20 23:59:59', 'CERRADA', 1, 1),
(4, '¿Está de acuerdo con la renovación del sistema de iluminación de calles internas a tecnología LED? Inversión total: $95,000.00 a cubrirse con el fondo de reserva.',
    '2026-03-05 00:00:00', '2026-04-30 23:59:59', 'ABIERTA', 2, 6),
(5, '¿Aprueba la contratación de guardias de seguridad adicionales los fines de semana (viernes a domingo) con un costo extra de $6,200.00 mensuales?',
    '2026-01-10 00:00:00', '2026-02-10 23:59:59', 'CERRADA', 2, 6),
(6, '¿Autoriza la construcción de un área de juegos infantiles en el jardín norte con un costo de $150,000.00 proveniente del remanente del ejercicio 2025?',
    '2025-11-15 00:00:00', '2025-12-15 23:59:59', 'CERRADA', 2, 6),
(7, '¿Aprueba la implementación de un sistema de acceso con reconocimiento de placas vehiculares (LPR) para el estacionamiento? Costo: $175,000.00 a cubrir en 12 mensualidades de $14,583.33 distribuidas entre todas las unidades.',
    '2026-04-01 00:00:00', '2026-05-15 23:59:59', 'ABIERTA', 3, 12),
(8, '¿Está de acuerdo con el incremento de la cuota de mantenimiento? El detalle de la propuesta se encuentra en el aviso publicado el 5 de enero de 2026. El nuevo monto aplicaría a partir del periodo Marzo 2026.',
    '2026-01-15 00:00:00', '2026-02-15 23:59:59', 'CERRADA', 3, 12),
(9, '¿Autoriza la remodelación del lobby principal y los sanitarios del primer piso por un monto total de $340,000.00 a ejecutarse durante el segundo trimestre de 2026?',
    '2026-02-01 00:00:00', '2026-03-15 23:59:59', 'CERRADA', 3, 12)
ON CONFLICT (id_votacion) DO UPDATE SET
  pregunta = EXCLUDED.pregunta, fecha_inicio = EXCLUDED.fecha_inicio,
  fecha_fin = EXCLUDED.fecha_fin, estado = EXCLUDED.estado,
  id_condominio = EXCLUDED.id_condominio,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

-- ============================================================================
-- 14. VOTOS (39)
-- ============================================================================
INSERT INTO votos (id_voto, opcion, fecha_emision, id_votacion, id_usuario_condominio) VALUES
-- Vot 1 (ABIERTA) - presupuesto jardinería
( 1, 'FAVOR',  '2026-03-12 14:30:00', 1,  2),
( 2, 'CONTRA', '2026-03-18 10:15:00', 1,  3),
( 3, 'FAVOR',  '2026-03-05 09:00:00', 1,  4),
( 4, 'FAVOR',  '2026-03-08 11:00:00', 1,  1),
-- Vot 2 (CERRADA) - paneles solares
( 5, 'CONTRA', '2026-02-01 16:00:00', 2,  2),
( 6, 'CONTRA', '2026-01-28 09:30:00', 2,  3),
( 7, 'FAVOR',  '2026-01-20 14:00:00', 2,  4),
( 8, 'FAVOR',  '2026-01-25 10:00:00', 2,  1),
-- Vot 3 (CERRADA) - cambio limpieza
( 9, 'FAVOR',  '2025-12-10 11:00:00', 3,  2),
(10, 'FAVOR',  '2025-12-12 15:30:00', 3,  3),
(11, 'FAVOR',  '2025-12-05 09:45:00', 3,  4),
(12, 'FAVOR',  '2025-12-03 08:00:00', 3,  1),
-- Vot 4 (ABIERTA) - iluminación LED
(13, 'FAVOR',  '2026-04-02 10:20:00', 4,  7),
(14, 'FAVOR',  '2026-03-10 14:00:00', 4,  8),
(15, 'CONTRA', '2026-03-22 11:30:00', 4,  9),
(16, 'FAVOR',  '2026-03-15 09:00:00', 4,  6),
-- Vot 5 (CERRADA) - seguridad fines de semana
(17, 'FAVOR',  '2026-01-25 13:15:00', 5,  7),
(18, 'FAVOR',  '2026-01-30 10:40:00', 5,  8),
(19, 'CONTRA', '2026-02-05 09:00:00', 5,  9),
(20, 'FAVOR',  '2026-02-01 16:30:00', 5, 10),
(21, 'FAVOR',  '2026-01-28 08:00:00', 5, 11),
(22, 'FAVOR',  '2026-01-15 10:00:00', 5,  6),
-- Vot 6 (CERRADA) - juegos infantiles
(23, 'FAVOR',  '2025-12-01 11:00:00', 6,  7),
(24, 'CONTRA', '2025-11-28 14:20:00', 6,  8),
(25, 'CONTRA', '2025-12-10 09:30:00', 6,  9),
(26, 'FAVOR',  '2025-11-20 15:00:00', 6, 10),
(27, 'FAVOR',  '2025-11-22 10:45:00', 6,  6),
-- Vot 7 (ABIERTA) - placas vehiculares
(28, 'FAVOR',  '2026-04-10 14:30:00', 7, 13),
(29, 'FAVOR',  '2026-04-05 09:00:00', 7, 14),
(30, 'FAVOR',  '2026-04-08 11:15:00', 7, 12),
-- Vot 8 (CERRADA) - incremento cuota
(31, 'FAVOR',  '2026-02-01 12:30:00', 8, 13),
(32, 'FAVOR',  '2026-02-05 10:00:00', 8, 14),
(33, 'FAVOR',  '2026-01-20 15:45:00', 8, 16),
(34, 'FAVOR',  '2026-01-22 09:00:00', 8, 12),
-- Vot 9 (CERRADA) - remodelación lobby
(35, 'FAVOR',  '2026-02-18 14:20:00', 9, 13),
(36, 'CONTRA', '2026-02-25 09:45:00', 9, 14),
(37, 'FAVOR',  '2026-02-10 16:00:00', 9, 16),
(38, 'FAVOR',  '2026-02-14 11:30:00', 9, 15),
(39, 'FAVOR',  '2026-02-05 10:00:00', 9, 12)
ON CONFLICT (id_voto) DO UPDATE SET
  opcion = EXCLUDED.opcion, fecha_emision = EXCLUDED.fecha_emision,
  id_votacion = EXCLUDED.id_votacion, id_usuario_condominio = EXCLUDED.id_usuario_condominio;

-- ============================================================================
-- 15. VOTACIONES_CAMBIO_CUOTA (1 — extensión de votación 8)
-- ============================================================================
INSERT INTO votaciones_cambio_cuota (id_votacion, monto_propuesto, recargo_propuesto, dia_limite_propuesto, estado_propuesta, periodo_aplicacion, motivo, fecha_ejecucion) VALUES
(8, 2900.00, 50.00, 20, 'APROBADA', '2026-03',
    'La cuota actual ($2,500 deptos / $2,800 locales) ya no es suficiente para cubrir los costos operativos. Factores: incremento en tarifas de energía eléctrica (+18 interanual), aumento salarial del personal de seguridad y limpieza (+12), y necesidad de constituir un fondo de reserva para mantenimiento mayor del elevador. Nuevo monto propuesto: $2,900.00 para todos los tipos de unidad, con recargo de $50.00/día a partir de Marzo 2026.',
    '2026-02-20 10:00:00')
ON CONFLICT (id_votacion) DO UPDATE SET
  monto_propuesto = EXCLUDED.monto_propuesto, recargo_propuesto = EXCLUDED.recargo_propuesto,
  dia_limite_propuesto = EXCLUDED.dia_limite_propuesto, estado_propuesta = EXCLUDED.estado_propuesta,
  periodo_aplicacion = EXCLUDED.periodo_aplicacion, motivo = EXCLUDED.motivo,
  fecha_ejecucion = EXCLUDED.fecha_ejecucion;


-- ============================================================================
-- 16. REPORTES_MANTENIMIENTO (12)
-- ============================================================================
INSERT INTO reportes_mantenimiento (id_reporte, descripcion, fecha_reporte, estado, comentario_admin, id_condominio, id_usuario_condominio_reporta, id_usuario_condominio_admin) VALUES
( 1, 'Fuga de agua en pasillo del tercer piso, frente al departamento A-302. Se observa humedad en el techo y goteo constante sobre el piso de cerámica.',
    '2026-03-16 10:15:00', 'EN_PROCESO',
    'Se contactó al plomero. Vendrá el jueves 19 de marzo a las 09:00 para revisar la tubería. Mientras tanto se colocó una cubeta y señalización.', 1, 2, 1),
( 2, 'Ventana del pasillo del segundo piso (lado norte) con el cristal roto. Representa riesgo para los niños que transitan por la zona.',
    '2026-02-11 08:30:00', 'RESUELTO',
    'Vidriería Continental reemplazó el cristal el 14 de febrero. Costo: $1,850.00. Se cargó al fondo de mantenimiento.', 1, 3, 1),
( 3, 'Elevador del edificio A presenta fallas intermitentes: se detiene entre pisos 2-3 veces al día. El último incidente fue hoy a las 08:00 hrs.',
    '2026-01-22 08:15:00', 'CERRADO',
    'Ascensores Modernos realizó servicio correctivo el 25 de enero. Se reemplazó el sensor de posicionamiento y se reprogramó el PLC. Se programó mantenimiento preventivo bimestral a partir de febrero.', 1, 2, 1),
( 4, 'El portón de acceso vehicular tarda más de 30 segundos en cerrar y en ocasiones se queda a media apertura. Ya van 3 veces esta semana que amanece abierto.',
    '2026-04-03 19:20:00', 'ABIERTO', NULL, 1, 4, NULL),
( 5, 'La banqueta frente a la casa B-102 tiene una grieta profunda y el concreto está levantado. Mi esposa casi se tropieza ayer. Es urgente repararlo.',
    '2026-03-28 11:30:00', 'EN_PROCESO',
    'Ya se cotizó la reparación con Concretos del Bajío: $4,200.00 incluyendo demolición y vaciado de nueva banqueta. Inician trabajos el 2 de abril.', 2, 8, 6),
( 6, 'Dos reflectores del jardín central no encienden desde hace 4 días. La zona queda completamente a oscuras por las noches, riesgo de seguridad.',
    '2026-02-05 18:00:00', 'RESUELTO',
    'ElectroPlus reemplazó los balastros y focos de ambos reflectores el 7 de febrero. Se revisaron los 8 reflectores restantes — todos funcionando correctamente.', 2, 10, 6),
( 7, 'En la casa B-301 hay un olor muy fuerte a gas desde ayer. El vecino (Juan Pablo Castro) no contesta el teléfono ni abre la puerta. Puede ser una fuga peligrosa.',
    '2026-04-12 07:30:00', 'ABIERTO',
    'Se contactó a Protección Civil y a Gas Natural del Bajío. Acudieron al domicilio a las 08:45. El residente se encontraba de viaje. Se cortó el suministro desde la toma principal. No se detectó fuga activa; el olor provenía de una estufa mal cerrada antes del viaje. Se dejó aviso al propietario.', 2, 9, 6),
( 8, 'El sistema de riego automático del jardín norte no se apaga. Lleva 2 días regando de forma continua, ya se está encharcando el área y desperdiciando mucha agua.',
    '2026-04-05 09:40:00', 'RESUELTO',
    'Se reemplazó la electroválvula de la zona norte y se reprogramó el temporizador. El técnico de VerdeVivo ajustó además los aspersores que estaban descalibrados.', 2, 7, 6),
( 9, 'El sistema de aire acondicionado del pasillo central del segundo piso dejó de funcionar. La temperatura en esa zona es insoportable y afecta a los locales D-201 y D-202.',
    '2026-04-18 14:20:00', 'EN_PROCESO',
    'ClimaControl ya diagnosticó: fuga de refrigerante en serpentín del evaporador. Refacción en tránsito, llega el 23 de abril. Instalación programada para el 24 de abril.', 3, 15, 12),
(10, 'La puerta de emergencia de la escalera norte tiene el mecanismo de cierre atorado. No cierra completamente y emite un pitido constante que molesta a los inquilinos del D-301.',
    '2026-03-05 08:50:00', 'RESUELTO',
    'Cerrajería Express reemplazó el brazo hidráulico y ajustó la cerradura el 6 de marzo. Costo: $2,350.00.', 3, 16, 12),
(11, 'El tinaco del tercer piso presenta una fisura y tira agua hacia el estacionamiento del lado norte. Se está mojando el auto del local L-102 (Camila Vallejo).',
    '2026-02-14 07:10:00', 'CERRADO',
    'Se reemplazó el tinaco completo por uno nuevo de 5,000 litros (Rotoplas). Instalación realizada el 17 de febrero. Costo total: $18,700.00 cubierto por póliza de seguro. Deducible: $5,000.00.', 3, 14, 12),
(12, 'La bomba de agua del sistema contra incendios no arrancó durante la prueba mensual de ayer. Es un riesgo grave de seguridad para todo el inmueble.',
    '2026-04-25 16:00:00', 'ABIERTO', NULL, 3, 13, NULL)
ON CONFLICT (id_reporte) DO UPDATE SET
  descripcion = EXCLUDED.descripcion, fecha_reporte = EXCLUDED.fecha_reporte,
  estado = EXCLUDED.estado, comentario_admin = EXCLUDED.comentario_admin,
  id_condominio = EXCLUDED.id_condominio,
  id_usuario_condominio_reporta = EXCLUDED.id_usuario_condominio_reporta,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

-- ============================================================================
-- 17. GASTOS (25)
-- ============================================================================
INSERT INTO gastos (id_gasto, concepto, categoria, monto, fecha, proveedor, nota, url_comprobante, id_condominio) VALUES
( 1, 'Servicio de jardinería mensual — enero 2026', 'Jardinería', 5400.00, '2026-01-10 12:00:00', 'VerdeVivo S.A. de C.V.', 'Poda de pasto, setos y palmeras.', NULL, 1),
( 2, 'Servicio de jardinería mensual — febrero 2026', 'Jardinería', 5400.00, '2026-02-12 12:00:00', 'VerdeVivo S.A. de C.V.', 'Servicio programado mensual.', NULL, 1),
( 3, 'Mantenimiento correctivo de elevador — cambio de sensor', 'Mantenimiento', 9100.00, '2026-01-25 14:30:00', 'Ascensores Modernos S.A.', 'Factura A-4581. Sensor de posicionamiento + reprogramación de PLC.', '/comprobantes/cond1/factura_ascensores_ene26.pdf', 1),
( 4, 'Reparación de cristal roto — ventana pasillo 2do piso', 'Reparaciones', 1850.00, '2026-02-14 11:00:00', 'Vidriería Continental', 'Factura VC-2204. Reemplazo de cristal templado de 6mm.', '/comprobantes/cond1/factura_vidrieria_feb26.pdf', 1),
( 5, 'Servicio de limpieza — enero 2026', 'Limpieza', 15200.00, '2026-01-31 12:00:00', 'BrillaMax S.A. de C.V.', 'Limpieza de áreas comunes, pasillos, escaleras, lobby y estacionamiento.', NULL, 1),
( 6, 'Servicio de limpieza — febrero 2026', 'Limpieza', 15200.00, '2026-02-28 12:00:00', 'BrillaMax S.A. de C.V.', 'Limpieza programada mensual.', NULL, 1),
( 7, 'Servicio de limpieza — marzo 2026', 'Limpieza', 15200.00, '2026-03-31 12:00:00', 'BrillaMax S.A. de C.V.', 'Limpieza programada mensual.', NULL, 1),
( 8, 'Suministro de agua potable — bimestre ene-feb 2026', 'Suministros', 8600.00, '2026-02-27 12:00:00', 'SACMEX', 'Medidor 45A-X789. Consumo de áreas comunes.', '/comprobantes/cond1/recibo_agua_enefeb26.pdf', 1),
( 9, 'Consumo de energía eléctrica — enero 2026', 'Suministros', 12450.00, '2026-01-31 12:00:00', 'CFE', 'Medidor 45B-Y123. Servicio BT2.', '/comprobantes/cond1/recibo_cfe_ene26.pdf', 1),
(10, 'Consumo de energía eléctrica — febrero 2026', 'Suministros', 11890.00, '2026-02-28 12:00:00', 'CFE', 'Medidor 45B-Y123. Servicio BT2.', '/comprobantes/cond1/recibo_cfe_feb26.pdf', 1),
(11, 'Pago de nómina de guardias de seguridad — enero 2026', 'Seguridad', 22000.00, '2026-01-31 12:00:00', 'GuardPro S.A. de C.V.', '3 elementos, turnos de 12 hrs. Incluye prestaciones.', '/comprobantes/cond2/nomina_seguridad_ene26.pdf', 2),
(12, 'Fumigación general trimestral', 'Fumigación', 6500.00, '2026-02-20 10:00:00', 'AntiPlagas del Bajío', 'Cucarachas, hormigas y mosquitos en áreas comunes.', '/comprobantes/cond2/factura_fumigacion_feb26.pdf', 2),
(13, 'Servicio de jardinería — enero 2026', 'Jardinería', 3800.00, '2026-01-15 12:00:00', 'VerdeVivo S.A. de C.V.', 'Mantenimiento de jardines y áreas verdes.', NULL, 2),
(14, 'Servicio de jardinería — febrero 2026', 'Jardinería', 3800.00, '2026-02-15 12:00:00', 'VerdeVivo S.A. de C.V.', 'Incluye fertilización de rosales.', NULL, 2),
(15, 'Reparación de banqueta — B-102', 'Reparaciones', 4200.00, '2026-04-02 14:00:00', 'Concretos del Bajío S.A.', 'Factura CB-1402. Demolición y vaciado de concreto.', '/comprobantes/cond2/factura_concretos_abr26.pdf', 2),
(16, 'Reemplazo de electroválvula riego jardín norte', 'Mantenimiento', 3100.00, '2026-04-06 16:00:00', 'VerdeVivo S.A. de C.V.', 'Electroválvula Rain Bird 1" + temporizador digital.', '/comprobantes/cond2/factura_valvula_abr26.pdf', 2),
(17, 'Honorarios de auditoría financiera ejercicio 2025', 'Administración', 18000.00, '2026-02-05 12:00:00', 'ContaPlus Consultores S.C.', 'Factura CP-891. Dictamen favorable sin observaciones.', '/comprobantes/cond2/factura_auditoria_2025.pdf', 2),
(18, 'Consumo de energía eléctrica — bimestre ene-feb 2026', 'Suministros', 9350.00, '2026-02-28 12:00:00', 'CFE', 'Medidor JAL-78X-0045. Alumbrado público y caseta.', '/comprobantes/cond2/recibo_cfe_enefeb26.pdf', 2),
(19, 'Servicio de seguridad — enero 2026', 'Seguridad', 28000.00, '2026-01-31 12:00:00', 'GuardPro S.A. de C.V.', '4 elementos 24/7. Incluye monitoreo de CCTV.', '/comprobantes/cond3/seguridad_ene26.pdf', 3),
(20, 'Servicio de seguridad — febrero 2026', 'Seguridad', 28000.00, '2026-02-28 12:00:00', 'GuardPro S.A. de C.V.', '4 elementos 24/7.', NULL, 3),
(21, 'Mantenimiento de elevador — preventivo bimestral', 'Mantenimiento', 7200.00, '2026-02-10 15:00:00', 'Ascensores Modernos S.A.', 'Contrato AM-3401. Servicio preventivo ene-feb 2026.', '/comprobantes/cond3/mant_elevador_feb26.pdf', 3),
(22, 'Reemplazo de tinaco 5,000 L — Rotoplas', 'Reparaciones', 18700.00, '2026-02-17 12:00:00', 'Plomería Profesional del Norte', 'Cubierto por póliza de seguro GNP. Deducible: $5,000.00.', '/comprobantes/cond3/factura_tinaco_feb26.pdf', 3),
(23, 'Póliza de seguro contra incendio 2026', 'Seguros', 34500.00, '2026-01-10 12:00:00', 'GNP Seguros', 'Póliza 2026-INC-45892. Suma asegurada incrementada 8%. Vigencia: 01-ene a 31-dic 2026.', '/comprobantes/cond3/poliza_gnp_2026.pdf', 3),
(24, 'Servicio de limpieza — enero 2026', 'Limpieza', 12800.00, '2026-01-31 12:00:00', 'BrillaMax S.A. de C.V.', 'Limpieza de pasillos, lobby, sanitarios y estacionamiento.', '/comprobantes/cond3/limpieza_ene26.pdf', 3),
(25, 'Servicio de limpieza — febrero 2026', 'Limpieza', 12800.00, '2026-02-28 12:00:00', 'BrillaMax S.A. de C.V.', 'Limpieza programada mensual.', NULL, 3)
ON CONFLICT (id_gasto) DO UPDATE SET
  concepto = EXCLUDED.concepto, categoria = EXCLUDED.categoria, monto = EXCLUDED.monto,
  fecha = EXCLUDED.fecha, proveedor = EXCLUDED.proveedor, nota = EXCLUDED.nota,
  url_comprobante = EXCLUDED.url_comprobante, id_condominio = EXCLUDED.id_condominio;

-- ============================================================================
-- 18. REPORTES_FINANCIEROS (9)
-- ============================================================================
INSERT INTO reportes_financieros (id_reporte_financiero, periodo, fecha_generacion, total_ingresos, total_gastos, total_adeudos, url_pdf, url_excel, id_condominio) VALUES
(1, '2026-01', '2026-01-31 23:59:59', 13200.00, 51450.00,  2200.00, '/reportes/cond1/reporte_2026-01.pdf', '/reportes/cond1/reporte_2026-01.xlsx', 1),
(2, '2026-02', '2026-02-28 23:59:59',  8800.00, 41540.00,  6600.00, '/reportes/cond1/reporte_2026-02.pdf', '/reportes/cond1/reporte_2026-02.xlsx', 1),
(3, '2026-03', '2026-03-31 23:59:59',  8800.00, 15200.00, 15400.00, '/reportes/cond1/reporte_2026-03.pdf', '/reportes/cond1/reporte_2026-03.xlsx', 1),
(4, '2026-01', '2026-01-31 23:59:59',  7200.00, 25800.00,  5400.00, '/reportes/cond2/reporte_2026-01.pdf', '/reportes/cond2/reporte_2026-01.xlsx', 2),
(5, '2026-02', '2026-02-28 23:59:59',  9000.00, 37750.00, 10800.00, '/reportes/cond2/reporte_2026-02.pdf', '/reportes/cond2/reporte_2026-02.xlsx', 2),
(6, '2026-03', '2026-03-31 23:59:59',  3600.00,     0.00, 16200.00, '/reportes/cond2/reporte_2026-03.pdf', '/reportes/cond2/reporte_2026-03.xlsx', 2),
(7, '2026-01', '2026-01-31 23:59:59',  5300.00, 75300.00,  5300.00, '/reportes/cond3/reporte_2026-01.pdf', '/reportes/cond3/reporte_2026-01.xlsx', 3),
(8, '2026-02', '2026-02-28 23:59:59',  5300.00, 66700.00, 10600.00, '/reportes/cond3/reporte_2026-02.pdf', '/reportes/cond3/reporte_2026-02.xlsx', 3),
(9, '2026-03', '2026-03-31 23:59:59', 10800.00,     0.00, 22200.00, '/reportes/cond3/reporte_2026-03.pdf', '/reportes/cond3/reporte_2026-03.xlsx', 3)
ON CONFLICT (id_reporte_financiero) DO UPDATE SET
  periodo = EXCLUDED.periodo, fecha_generacion = EXCLUDED.fecha_generacion,
  total_ingresos = EXCLUDED.total_ingresos, total_gastos = EXCLUDED.total_gastos,
  total_adeudos = EXCLUDED.total_adeudos, url_pdf = EXCLUDED.url_pdf,
  url_excel = EXCLUDED.url_excel, id_condominio = EXCLUDED.id_condominio;

-- ============================================================================
-- 19. REPORTE_FINANCIERO_DETALLE (48 líneas)
-- ============================================================================
INSERT INTO reporte_financiero_detalle (id_detalle, tipo, fecha, monto, id_reporte_financiero, id_pago, id_gasto) VALUES
-- Cond 1 - Ene 2026 (reporte 1)
( 1, 'INGRESO', '2026-01-18 10:30:00', 2200.00, 1,  1, NULL),
( 2, 'INGRESO', '2026-01-17 11:00:00', 2200.00, 1,  6, NULL),
( 3, 'INGRESO', '2026-01-15 08:30:00', 2200.00, 1, 11, NULL),
( 4, 'INGRESO', '2026-01-14 08:50:00', 2200.00, 1, 14, NULL),
( 5, 'EGRESO',  '2026-01-10 12:00:00', 5400.00, 1, NULL,  1),
( 6, 'EGRESO',  '2026-01-25 14:30:00', 9100.00, 1, NULL,  3),
( 7, 'EGRESO',  '2026-01-31 12:00:00',15200.00, 1, NULL,  5),
( 8, 'EGRESO',  '2026-01-31 12:00:00',12450.00, 1, NULL,  9),
-- Cond 1 - Feb 2026 (reporte 2)
( 9, 'INGRESO', '2026-02-19 14:15:00', 2200.00, 2,  2, NULL),
(10, 'INGRESO', '2026-02-18 10:10:00', 2200.00, 2, 12, NULL),
(11, 'INGRESO', '2026-02-19 15:30:00', 2200.00, 2, 13, NULL),
(12, 'EGRESO',  '2026-02-12 12:00:00', 5400.00, 2, NULL,  2),
(13, 'EGRESO',  '2026-02-14 11:00:00', 1850.00, 2, NULL,  4),
(14, 'EGRESO',  '2026-02-28 12:00:00',15200.00, 2, NULL,  6),
(15, 'EGRESO',  '2026-02-27 12:00:00', 8600.00, 2, NULL,  8),
(16, 'EGRESO',  '2026-02-28 12:00:00',11890.00, 2, NULL, 10),
-- Cond 1 - Mar 2026 (reporte 3)
(17, 'INGRESO', '2026-03-19 09:45:00', 2200.00, 3,  3, NULL),
(18, 'INGRESO', '2026-03-17 12:00:00', 2200.00, 3, 14, NULL),
(19, 'EGRESO',  '2026-03-31 12:00:00',15200.00, 3, NULL,  7),
-- Cond 2 - Ene 2026 (reporte 4)
(20, 'INGRESO', '2026-01-16 09:00:00', 1800.00, 4, 23, NULL),
(21, 'INGRESO', '2026-01-20 17:00:00', 1800.00, 4, 28, NULL),
(22, 'INGRESO', '2026-01-13 10:15:00', 1800.00, 4, 33, NULL),
(23, 'INGRESO', '2026-01-14 08:50:00', 1800.00, 4, 38, NULL),
(24, 'EGRESO',  '2026-01-31 12:00:00',22000.00, 4, NULL, 11),
(25, 'EGRESO',  '2026-01-15 12:00:00', 3800.00, 4, NULL, 13),
-- Cond 2 - Feb 2026 (reporte 5)
(26, 'INGRESO', '2026-02-18 11:20:00', 1800.00, 5, 24, NULL),
(27, 'INGRESO', '2026-02-20 09:30:00', 1800.00, 5, 29, NULL),
(28, 'INGRESO', '2026-02-21 15:45:00', 1800.00, 5, 34, NULL),
(29, 'INGRESO', '2026-02-16 11:10:00', 1800.00, 5, 39, NULL),
(30, 'EGRESO',  '2026-02-20 10:00:00', 6500.00, 5, NULL, 12),
(31, 'EGRESO',  '2026-02-15 12:00:00', 3800.00, 5, NULL, 14),
(32, 'EGRESO',  '2026-02-05 12:00:00',18000.00, 5, NULL, 17),
(33, 'EGRESO',  '2026-02-28 12:00:00', 9350.00, 5, NULL, 18),
-- Cond 2 - Mar 2026 (reporte 6)
(34, 'INGRESO', '2026-03-18 13:40:00', 1800.00, 6, 25, NULL),
(35, 'INGRESO', '2026-03-17 16:25:00', 1800.00, 6, 40, NULL),
-- Cond 3 - Ene 2026 (reporte 7)
(36, 'INGRESO', '2026-01-17 10:05:00', 2800.00, 7, 48, NULL),
(37, 'INGRESO', '2026-01-15 08:00:00', 2500.00, 7, 64, NULL),
(38, 'EGRESO',  '2026-01-31 12:00:00',28000.00, 7, NULL, 19),
(39, 'EGRESO',  '2026-01-10 12:00:00',34500.00, 7, NULL, 23),
(40, 'EGRESO',  '2026-01-31 12:00:00',12800.00, 7, NULL, 24),
-- Cond 3 - Feb 2026 (reporte 8)
(41, 'INGRESO', '2026-02-17 09:35:00', 2800.00, 8, 49, NULL),
(42, 'INGRESO', '2026-02-17 09:20:00', 2500.00, 8, 65, NULL),
(43, 'EGRESO',  '2026-02-28 12:00:00',28000.00, 8, NULL, 20),
(44, 'EGRESO',  '2026-02-10 15:00:00', 7200.00, 8, NULL, 21),
(45, 'EGRESO',  '2026-02-17 12:00:00',18700.00, 8, NULL, 22),
(46, 'EGRESO',  '2026-02-28 12:00:00',12800.00, 8, NULL, 25),
-- Cond 3 - Mar 2026 (reporte 9)
(47, 'INGRESO', '2026-03-19 14:50:00', 2800.00, 9, 50, NULL),
(48, 'INGRESO', '2026-03-21 11:30:00', 2800.00, 9, 55, NULL),
(49, 'INGRESO', '2026-03-18 12:15:00', 2500.00, 9, 58, NULL),
(50, 'INGRESO', '2026-03-16 11:45:00', 2500.00, 9, 66, NULL)
ON CONFLICT (id_detalle) DO UPDATE SET
  tipo = EXCLUDED.tipo, fecha = EXCLUDED.fecha, monto = EXCLUDED.monto,
  id_reporte_financiero = EXCLUDED.id_reporte_financiero,
  id_pago = EXCLUDED.id_pago, id_gasto = EXCLUDED.id_gasto;

