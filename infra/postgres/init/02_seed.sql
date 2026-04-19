-- Elyx seed data for local/dev/demo
-- Safe to run multiple times.

INSERT INTO usuarios (
  id_usuario,
  nombre,
  primer_apellido,
  segundo_apellido,
  correo,
  password_hash,
  es_superusuario,
  requiere_cambio_password
)
VALUES
  (1, 'Condomino', 'Torre', 'Norte', 'condomino@elyx.mx', '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
  (2, 'Administrador', 'General', NULL, 'admin@elyx.mx', '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', FALSE, FALSE),
  (3, 'Super', 'Usuario', NULL, 'superadmin@elyx.mx', '$2b$10$Cig1FWSTErgAlbYEVpDWzOm5ShpGBV8X8QCm0pAg6ANfU4.3oyFZC', TRUE, TRUE)
ON CONFLICT (id_usuario) DO UPDATE
SET
  nombre = EXCLUDED.nombre,
  primer_apellido = EXCLUDED.primer_apellido,
  segundo_apellido = EXCLUDED.segundo_apellido,
  correo = EXCLUDED.correo,
  password_hash = EXCLUDED.password_hash,
  es_superusuario = EXCLUDED.es_superusuario,
  requiere_cambio_password = EXCLUDED.requiere_cambio_password;

INSERT INTO condominios (id_condominio, nombre, direccion, estado)
VALUES
  (101, 'Residencial Bosque Norte', 'Av. Encinos 540, Col. Bosque Norte', 'ACTIVO'),
  (202, 'Condominio Marfil Sur', 'Calle Marfil 210, Col. Vista Sur', 'ACTIVO')
ON CONFLICT (id_condominio) DO UPDATE
SET
  nombre = EXCLUDED.nombre,
  direccion = EXCLUDED.direccion,
  estado = EXCLUDED.estado;

INSERT INTO usuarios_condominios (id_usuario_condominio, rol, estado, id_usuario, id_condominio)
VALUES
  (1001, 'CONDOMINO', 'ACTIVO', 1, 101),
  (1002, 'CONDOMINO', 'ACTIVO', 1, 202),
  (2001, 'ADMINISTRADOR', 'ACTIVO', 2, 101),
  (2002, 'ADMINISTRADOR', 'ACTIVO', 2, 202)
ON CONFLICT (id_usuario_condominio) DO UPDATE
SET
  rol = EXCLUDED.rol,
  estado = EXCLUDED.estado,
  id_usuario = EXCLUDED.id_usuario,
  id_condominio = EXCLUDED.id_condominio;

INSERT INTO unidades (id_unidad, clave_unidad, tipo_unidad, estado, id_condominio)
VALUES
  (5001, 'A-302', 'DEPARTAMENTO', 'ACTIVA', 101),
  (5002, 'A-305', 'DEPARTAMENTO', 'ACTIVA', 101),
  (6001, 'B-204', 'DEPARTAMENTO', 'ACTIVA', 202),
  (6002, 'B-305', 'DEPARTAMENTO', 'ACTIVA', 202)
ON CONFLICT (id_unidad) DO UPDATE
SET
  clave_unidad = EXCLUDED.clave_unidad,
  tipo_unidad = EXCLUDED.tipo_unidad,
  estado = EXCLUDED.estado,
  id_condominio = EXCLUDED.id_condominio;

INSERT INTO unidades_ocupantes (id_ocupacion, tipo_ocupacion, fecha_inicio, fecha_fin, id_usuario_condominio, id_unidad)
VALUES
  (1, 'PROPIETARIO', '2025-01-01', NULL, 1001, 5001),
  (2, 'PROPIETARIO', '2025-01-01', NULL, 1002, 6001)
ON CONFLICT (id_ocupacion) DO UPDATE
SET
  tipo_ocupacion = EXCLUDED.tipo_ocupacion,
  fecha_inicio = EXCLUDED.fecha_inicio,
  fecha_fin = EXCLUDED.fecha_fin,
  id_usuario_condominio = EXCLUDED.id_usuario_condominio,
  id_unidad = EXCLUDED.id_unidad;

INSERT INTO cuotas (id_cuota, periodo, monto_base, fecha_limite, recargo_por_dia, estado, id_condominio, id_unidad)
VALUES
  (1, 'Marzo 2026', 1850.00, '2026-03-20', 50.00, 'PENDIENTE', 101, 5001),
  (2, 'Abril 2026', 1850.00, '2026-04-20', 0.00, 'PENDIENTE', 101, 5002),
  (3, 'Marzo 2026', 1650.00, '2026-03-21', 30.00, 'PENDIENTE', 202, 6001),
  (4, 'Abril 2026', 1650.00, '2026-04-21', 0.00, 'PENDIENTE', 202, 6002)
ON CONFLICT (id_cuota) DO UPDATE
SET
  periodo = EXCLUDED.periodo,
  monto_base = EXCLUDED.monto_base,
  fecha_limite = EXCLUDED.fecha_limite,
  recargo_por_dia = EXCLUDED.recargo_por_dia,
  estado = EXCLUDED.estado,
  id_condominio = EXCLUDED.id_condominio,
  id_unidad = EXCLUDED.id_unidad;

INSERT INTO pagos (
  id_pago,
  monto,
  fecha_pago,
  estado,
  referencia,
  motivo_rechazo,
  id_cuota,
  id_usuario_condominio_paga,
  id_usuario_condominio_admin
)
VALUES
  (2421, 1850.00, '2026-03-16T14:15:00.000Z', 'CAPTURADO', NULL, NULL, 1, 1001, NULL),
  (2422, 1650.00, '2026-03-17T10:10:00.000Z', 'CAPTURADO', NULL, NULL, 3, 1002, NULL)
ON CONFLICT (id_pago) DO UPDATE
SET
  monto = EXCLUDED.monto,
  fecha_pago = EXCLUDED.fecha_pago,
  estado = EXCLUDED.estado,
  referencia = EXCLUDED.referencia,
  motivo_rechazo = EXCLUDED.motivo_rechazo,
  id_cuota = EXCLUDED.id_cuota,
  id_usuario_condominio_paga = EXCLUDED.id_usuario_condominio_paga,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

INSERT INTO avisos (id_aviso, titulo, contenido, fecha_publicacion, id_condominio, id_usuario_condominio_admin)
VALUES
  (1, 'Mantenimiento de cisterna', 'Habra suspension de agua de 10:00 a 12:00.', '2026-03-13T09:00:00.000Z', 101, 2001),
  (2, 'Asamblea extraordinaria', 'Reunion en salon comun el sabado a las 18:00.', '2026-03-18T09:00:00.000Z', 202, 2002)
ON CONFLICT (id_aviso) DO UPDATE
SET
  titulo = EXCLUDED.titulo,
  contenido = EXCLUDED.contenido,
  fecha_publicacion = EXCLUDED.fecha_publicacion,
  id_condominio = EXCLUDED.id_condominio,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

INSERT INTO votaciones (id_votacion, pregunta, fecha_inicio, fecha_fin, estado, id_condominio, id_usuario_condominio_admin)
VALUES
  (1, 'Aprobar presupuesto de jardineria trimestral', '2026-03-01T00:00:00.000Z', '2026-03-30T23:59:59.000Z', 'ABIERTA', 101, 2001),
  (2, 'Renovacion de luminarias en areas comunes', '2026-03-05T00:00:00.000Z', '2026-03-29T23:59:59.000Z', 'ABIERTA', 202, 2002)
ON CONFLICT (id_votacion) DO UPDATE
SET
  pregunta = EXCLUDED.pregunta,
  fecha_inicio = EXCLUDED.fecha_inicio,
  fecha_fin = EXCLUDED.fecha_fin,
  estado = EXCLUDED.estado,
  id_condominio = EXCLUDED.id_condominio,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

INSERT INTO reportes_mantenimiento (
  id_reporte,
  descripcion,
  fecha_reporte,
  estado,
  comentario_admin,
  id_condominio,
  id_usuario_condominio_reporta,
  id_usuario_condominio_admin
)
VALUES
  (90, 'Pasillo B: Fuga en pasillo del edificio B', '2026-03-16T10:00:00.000Z', 'EN_PROCESO', NULL, 101, 1001, 2001),
  (91, 'Lobby Torre 2: Puerta automatica con falla intermitente', '2026-03-17T09:00:00.000Z', 'ABIERTO', NULL, 202, 1002, NULL)
ON CONFLICT (id_reporte) DO UPDATE
SET
  descripcion = EXCLUDED.descripcion,
  fecha_reporte = EXCLUDED.fecha_reporte,
  estado = EXCLUDED.estado,
  comentario_admin = EXCLUDED.comentario_admin,
  id_condominio = EXCLUDED.id_condominio,
  id_usuario_condominio_reporta = EXCLUDED.id_usuario_condominio_reporta,
  id_usuario_condominio_admin = EXCLUDED.id_usuario_condominio_admin;

INSERT INTO gastos (id_gasto, concepto, categoria, monto, fecha, proveedor, nota, url_comprobante, id_condominio)
VALUES
  (1, 'Jardineria', 'Servicios', 5400.00, '2026-03-08T12:00:00.000Z', NULL, NULL, NULL, 101),
  (2, 'Mantenimiento elevador', 'Mantenimiento', 9100.00, '2026-03-11T12:00:00.000Z', NULL, NULL, NULL, 101),
  (3, 'Limpieza de alberca', 'Servicios', 4700.00, '2026-03-10T12:00:00.000Z', NULL, NULL, NULL, 202)
ON CONFLICT (id_gasto) DO UPDATE
SET
  concepto = EXCLUDED.concepto,
  categoria = EXCLUDED.categoria,
  monto = EXCLUDED.monto,
  fecha = EXCLUDED.fecha,
  proveedor = EXCLUDED.proveedor,
  nota = EXCLUDED.nota,
  url_comprobante = EXCLUDED.url_comprobante,
  id_condominio = EXCLUDED.id_condominio;

INSERT INTO reportes_financieros (
  id_reporte_financiero,
  periodo,
  fecha_generacion,
  total_ingresos,
  total_gastos,
  total_adeudos,
  url_pdf,
  url_excel,
  id_condominio
)
VALUES
  (1, 'Enero 2026', '2026-01-31T23:59:59.000Z', 92500.00, 23300.00, 10400.00, NULL, NULL, 101),
  (2, 'Febrero 2026', '2026-02-28T23:59:59.000Z', 91150.00, 27500.00, 12200.00, NULL, NULL, 101),
  (3, 'Enero 2026', '2026-01-31T23:59:59.000Z', 68100.00, 20100.00, 8600.00, NULL, NULL, 202),
  (4, 'Febrero 2026', '2026-02-28T23:59:59.000Z', 70400.00, 21950.00, 9100.00, NULL, NULL, 202)
ON CONFLICT (id_reporte_financiero) DO UPDATE
SET
  periodo = EXCLUDED.periodo,
  fecha_generacion = EXCLUDED.fecha_generacion,
  total_ingresos = EXCLUDED.total_ingresos,
  total_gastos = EXCLUDED.total_gastos,
  total_adeudos = EXCLUDED.total_adeudos,
  url_pdf = EXCLUDED.url_pdf,
  url_excel = EXCLUDED.url_excel,
  id_condominio = EXCLUDED.id_condominio;

SELECT setval('usuarios_id_usuario_seq', GREATEST((SELECT MAX(id_usuario) FROM usuarios), 1));
SELECT setval('condominios_id_condominio_seq', GREATEST((SELECT MAX(id_condominio) FROM condominios), 1));
SELECT setval('usuarios_condominios_id_usuario_condominio_seq', GREATEST((SELECT MAX(id_usuario_condominio) FROM usuarios_condominios), 1));
SELECT setval('unidades_id_unidad_seq', GREATEST((SELECT MAX(id_unidad) FROM unidades), 1));
SELECT setval('unidades_ocupantes_id_ocupacion_seq', GREATEST((SELECT MAX(id_ocupacion) FROM unidades_ocupantes), 1));
SELECT setval('cuotas_id_cuota_seq', GREATEST((SELECT MAX(id_cuota) FROM cuotas), 1));
SELECT setval('pagos_id_pago_seq', GREATEST((SELECT MAX(id_pago) FROM pagos), 1));
SELECT setval('avisos_id_aviso_seq', GREATEST((SELECT MAX(id_aviso) FROM avisos), 1));
SELECT setval('votaciones_id_votacion_seq', GREATEST((SELECT MAX(id_votacion) FROM votaciones), 1));
SELECT setval('reportes_mantenimiento_id_reporte_seq', GREATEST((SELECT MAX(id_reporte) FROM reportes_mantenimiento), 1));
SELECT setval('gastos_id_gasto_seq', GREATEST((SELECT MAX(id_gasto) FROM gastos), 1));
SELECT setval('reportes_financieros_id_reporte_financiero_seq', GREATEST((SELECT MAX(id_reporte_financiero) FROM reportes_financieros), 1));
