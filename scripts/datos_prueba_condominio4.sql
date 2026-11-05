-- ============================================================================
-- ELYX - Datos de prueba para el condominio 4 (12 equipos)
--
-- Que hace (por cada condomino *.usuario@elyx.mx):
--   1. Membresia CONDOMINO en el condominio 4
--   2. Una unidad (clave derivada del prefijo del equipo)
--   3. Ocupante vigente de esa unidad
--   4. Estado de cuenta
--   5. 20 cuotas (mes actual y 19 anteriores)
--   6. Pagos: 14 VALIDADO (con recibo), 2 CAPTURADO y 1 RECHAZADO
--   7. Totales del estado de cuenta recalculados
--
-- Ademas, una sola vez para el condominio: avisos, votaciones, gastos y
-- reportes financieros de los ultimos 3 meses.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin duplicar nada.
-- Requiere que los usuarios ya existan (produccion).
--
-- Uso recomendado (desde el servidor, bash):
--   docker exec -i elyx-postgres psql -U elyx_user -d elyx \
--     -v ON_ERROR_STOP=1 < scripts/datos_prueba_condominio4.sql
-- ============================================================================

BEGIN;

DO $$
DECLARE
  c_cond       CONSTANT int := 4;
  v_prefijos   text[] := ARRAY[
    'empyron', 'bandmaid', 'surgepath', 'afterrewind', 'pokemontcgvault',
    'cafecharla', 'porke', 'myticket', 'proyectoblog', 'clara', 'mexicamp',
    'cellstore'
  ];
  v_prefijo    text;
  v_idx        int := 0;
  v_i          int;
  v_id_usuario int;
  v_id_uc      int;
  v_id_admin   int;
  v_id_unidad  int;
  v_clave      text;
  v_periodo    text;
  v_mes        date;
  v_limite     date;
  v_estado_c   text;
  v_monto      numeric;
  v_id_cuota   int;
  v_id_pago    int;
  v_pago_est   text;
  v_fecha_pago timestamp;
  v_cuotas_ok  int := 0;
  v_pagos_ok   int := 0;
  v_omitidos   text := '';
BEGIN
  -- Admin de referencia del condominio (para id_usuario_condominio_admin)
  SELECT uc.id_usuario_condominio INTO v_id_admin
  FROM usuarios_condominios uc
  WHERE uc.id_condominio = c_cond
    AND uc.rol = 'ADMINISTRADOR'
    AND uc.estado = 'ACTIVO'
  ORDER BY uc.id_usuario_condominio
  LIMIT 1;

  IF v_id_admin IS NULL THEN
    RAISE EXCEPTION 'El condominio % no tiene ningun administrador activo.', c_cond;
  END IF;

  FOREACH v_prefijo IN ARRAY v_prefijos LOOP
    v_idx := v_idx + 1;

    SELECT u.id_usuario INTO v_id_usuario
    FROM usuarios u
    WHERE lower(u.correo) = v_prefijo || '.usuario@elyx.mx'
    LIMIT 1;

    IF v_id_usuario IS NULL THEN
      v_omitidos := v_omitidos || ' ' || v_prefijo;
      CONTINUE;
    END IF;

    -- 1) Membresia como CONDOMINO -------------------------------------------
    INSERT INTO usuarios_condominios (rol, estado, id_usuario, id_condominio)
    VALUES ('CONDOMINO', 'ACTIVO', v_id_usuario, c_cond)
    ON CONFLICT (id_usuario, id_condominio) DO UPDATE SET estado = 'ACTIVO'
    RETURNING id_usuario_condominio INTO v_id_uc;

    -- 2) Unidad --------------------------------------------------------------
    v_clave := upper(left(v_prefijo, 3)) || '-' || lpad(v_idx::text, 2, '0');
    INSERT INTO unidades (clave_unidad, tipo_unidad, estado, id_condominio)
    VALUES (v_clave, 'DEPARTAMENTO', 'ACTIVA', c_cond)
    ON CONFLICT (id_condominio, clave_unidad) DO UPDATE SET estado = 'ACTIVA'
    RETURNING id_unidad INTO v_id_unidad;

    -- 3) Ocupante vigente ----------------------------------------------------
    IF NOT EXISTS (
      SELECT 1 FROM unidades_ocupantes uo
      WHERE uo.id_usuario_condominio = v_id_uc
        AND uo.fecha_fin IS NULL
    ) THEN
      INSERT INTO unidades_ocupantes
        (tipo_ocupacion, fecha_inicio, fecha_fin, id_usuario_condominio, id_unidad)
      VALUES
        ('PROPIETARIO', (CURRENT_DATE - INTERVAL '24 months')::date, NULL, v_id_uc, v_id_unidad);
    END IF;

    -- 4) Estado de cuenta ----------------------------------------------------
    INSERT INTO estado_cuenta
      (saldo_actual, total_adeudo, recargos_estimados, fecha_corte, id_unidad)
    VALUES
      (0, 0, 0, CURRENT_DATE, v_id_unidad)
    ON CONFLICT (id_unidad) DO NOTHING;

    -- 5) Cuotas y pagos ------------------------------------------------------
    -- Monto distinto por equipo para que los ordenamientos por monto se noten.
    v_monto := CASE v_idx % 3 WHEN 0 THEN 1800.00 WHEN 1 THEN 2200.00 ELSE 2500.00 END;

    FOR v_i IN 0..19 LOOP
      v_mes     := (date_trunc('month', CURRENT_DATE) - (v_i || ' months')::interval)::date;
      v_periodo := to_char(v_mes, 'YYYY-MM');
      v_limite  := (v_mes + INTERVAL '9 days')::date;   -- dia 10 de cada mes

      -- 0-3 recientes: por cobrar. 4-17: pagadas. 18-19: vencidas sin pago.
      IF v_i >= 18 THEN
        v_estado_c := 'VENCIDA';
      ELSIF v_i >= 4 THEN
        v_estado_c := 'PAGADA';
      ELSE
        v_estado_c := 'PENDIENTE';
      END IF;

      -- DO UPDATE sin cambios reales: nos permite obtener id_cuota aunque la
      -- fila ya existiera (DO NOTHING no devuelve fila en ese caso).
      INSERT INTO cuotas
        (periodo, tipo, monto_base, fecha_limite, recargo_por_dia, estado, id_condominio, id_unidad)
      VALUES
        (v_periodo, 'Cuota de mantenimiento', v_monto, v_limite, 45.00, v_estado_c, c_cond, v_id_unidad)
      ON CONFLICT (id_unidad, periodo) DO UPDATE SET periodo = EXCLUDED.periodo
      RETURNING id_cuota INTO v_id_cuota;

      v_cuotas_ok := v_cuotas_ok + 1;

      v_pago_est := NULL;
      IF v_i IN (1, 2) THEN
        v_pago_est := 'CAPTURADO';        -- pendiente de validacion
      ELSIF v_i = 3 THEN
        v_pago_est := 'RECHAZADO';        -- con motivo
      ELSIF v_i BETWEEN 4 AND 17 THEN
        v_pago_est := 'VALIDADO';         -- con recibo
      END IF;

      IF v_pago_est IS NOT NULL THEN
        v_fecha_pago := (v_limite - INTERVAL '2 days') + INTERVAL '11 hours';
        v_id_pago := NULL;

        INSERT INTO pagos
          (monto, fecha_pago, estado, referencia, motivo_rechazo,
           id_cuota, id_usuario_condominio_paga, id_usuario_condominio_admin)
        VALUES
          (CASE WHEN v_pago_est = 'RECHAZADO' THEN 1500.00 ELSE v_monto END,
           v_fecha_pago,
           v_pago_est,
           'REF-' || replace(v_periodo, '-', '') || '-' || lpad(v_idx::text, 2, '0'),
           CASE WHEN v_pago_est = 'RECHAZADO'
                THEN 'Monto insuficiente: se recibieron $1,500.00 de un monto esperado mayor. Favor de cubrir la diferencia.'
                ELSE NULL END,
           v_id_cuota,
           v_id_uc,
           CASE WHEN v_pago_est = 'VALIDADO' THEN v_id_admin ELSE NULL END)
        ON CONFLICT (id_cuota) DO NOTHING
        RETURNING id_pago INTO v_id_pago;

        IF v_id_pago IS NOT NULL THEN
          v_pagos_ok := v_pagos_ok + 1;

          -- Comprobante en los pagos aun no validados (la vista muestra la lista)
          IF v_pago_est <> 'VALIDADO' THEN
            INSERT INTO evidencias_pago
              (nombre_archivo, url_archivo, fecha_carga, id_pago)
            VALUES
              ('comprobante_' || v_periodo || '_' || v_prefijo || '.pdf',
               '/uploads/evidencias/cond' || c_cond || '/' || v_periodo || '_' || v_prefijo || '.pdf',
               v_fecha_pago + INTERVAL '5 minutes',
               v_id_pago);
          END IF;

          -- Recibo solo de pagos validados
          IF v_pago_est = 'VALIDADO' THEN
            INSERT INTO recibos (folio, fecha_generacion, url_pdf, id_pago)
            VALUES
              ('ELY-REC-' || v_periodo || '-' || lpad(v_idx::text, 2, '0'),
               v_fecha_pago + INTERVAL '1 day',
               '/recibos/cond' || c_cond || '/recibo_' || v_periodo || '_' || v_prefijo || '.pdf',
               v_id_pago)
            ON CONFLICT (id_pago) DO NOTHING;
          END IF;
        END IF;
      END IF;
    END LOOP;

    -- 6) Totales del estado de cuenta ----------------------------------------
    UPDATE estado_cuenta ec
    SET saldo_actual = 0,
        total_adeudo = COALESCE((
          SELECT SUM(c.monto_base)
          FROM cuotas c
          WHERE c.id_unidad = v_id_unidad
            AND c.estado <> 'PAGADA'
        ), 0),
        recargos_estimados = 0,
        fecha_corte = CURRENT_DATE
    WHERE ec.id_unidad = v_id_unidad;
  END LOOP;

  RAISE NOTICE 'Cuotas procesadas: %, pagos nuevos: %', v_cuotas_ok, v_pagos_ok;
  IF v_omitidos <> '' THEN
    RAISE NOTICE 'Usuarios no encontrados (omitidos):%', v_omitidos;
  END IF;
END $$;

-- ============================================================================
-- Extras del condominio (una sola vez)
-- ============================================================================

-- Avisos ---------------------------------------------------------------------
INSERT INTO avisos (titulo, contenido, fecha_publicacion, id_condominio, id_usuario_condominio_admin)
SELECT v.titulo, v.contenido,
       CURRENT_TIMESTAMP - (v.dias || ' days')::interval,
       c_cond.id_condominio,
       c_cond.id_admin
FROM (VALUES
  ('Asamblea general ordinaria',
   'Se convoca a todos los condominos a la asamblea general ordinaria. Puntos a tratar: informe financiero del trimestre, propuesta de presupuesto y asuntos generales.',
   2),
  ('Recordatorio de pago de cuota',
   'La fecha limite para el pago de la cuota de mantenimiento es el dia 10 de cada mes. A partir del dia 11 se genera un recargo por dia de atraso.',
   5),
  ('Mantenimiento del area de juegos',
   'El area de juegos permanecera cerrada por trabajos de pintura y reposicion de mobiliario. Se reabrira al terminar los trabajos.',
   9),
  ('Nuevo reglamento de areas comunes',
   'Entra en vigor el nuevo reglamento de uso de areas comunes. El documento completo esta disponible en la administracion.',
   16),
  ('Fumigacion trimestral',
   'Se realizara fumigacion en areas comunes. Se recomienda resguardar mascotas durante las horas posteriores al tratamiento.',
   23),
  ('Corte programado de agua',
   'Por limpieza de cisterna, el suministro de agua se suspendera de 09:00 a 14:00 hrs. Favor de tomar precauciones.',
   31)
) AS v(titulo, contenido, dias)
CROSS JOIN (
  SELECT uc.id_condominio,
         (SELECT uc2.id_usuario_condominio
          FROM usuarios_condominios uc2
          WHERE uc2.id_condominio = uc.id_condominio
            AND uc2.rol = 'ADMINISTRADOR'
            AND uc2.estado = 'ACTIVO'
          ORDER BY uc2.id_usuario_condominio
          LIMIT 1) AS id_admin
  FROM usuarios_condominios uc
  WHERE uc.id_condominio = 4
  LIMIT 1
) AS c_cond
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a
  WHERE a.id_condominio = c_cond.id_condominio AND a.titulo = v.titulo
);

-- Votaciones -----------------------------------------------------------------
INSERT INTO votaciones (pregunta, fecha_inicio, fecha_fin, estado, id_condominio, id_usuario_condominio_admin)
SELECT v.pregunta, v.inicio, v.fin, v.estado, c_cond.id_condominio, c_cond.id_admin
FROM (VALUES
  ('¿Aprueba el presupuesto de mantenimiento del siguiente trimestre?',
   CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '25 days', 'ABIERTA'),
  ('¿Esta de acuerdo con la instalacion de camaras de seguridad en el perimetro?',
   CURRENT_TIMESTAMP - INTERVAL '45 days', CURRENT_TIMESTAMP - INTERVAL '15 days', 'CERRADA'),
  ('¿Aprueba la contratacion de un servicio adicional de jardineria los sabados?',
   CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '20 days', 'ABIERTA')
) AS v(pregunta, inicio, fin, estado)
CROSS JOIN (
  SELECT uc.id_condominio,
         (SELECT uc2.id_usuario_condominio
          FROM usuarios_condominios uc2
          WHERE uc2.id_condominio = uc.id_condominio
            AND uc2.rol = 'ADMINISTRADOR'
            AND uc2.estado = 'ACTIVO'
          ORDER BY uc2.id_usuario_condominio
          LIMIT 1) AS id_admin
  FROM usuarios_condominios uc
  WHERE uc.id_condominio = 4
  LIMIT 1
) AS c_cond
WHERE NOT EXISTS (
  SELECT 1 FROM votaciones x
  WHERE x.id_condominio = c_cond.id_condominio AND x.pregunta = v.pregunta
);

-- Votos: un voto por condomino en cada votacion abierta ----------------------
INSERT INTO votos (opcion, fecha_emision, id_votacion, id_usuario_condominio)
SELECT CASE WHEN m.fila % 4 = 0 THEN 'CONTRA' ELSE 'FAVOR' END,
       CURRENT_TIMESTAMP - (m.fila || ' hours')::interval,
       vo.id_votacion,
       m.id_usuario_condominio
FROM (
  SELECT uc.id_usuario_condominio,
         row_number() OVER (ORDER BY uc.id_usuario_condominio) AS fila
  FROM usuarios_condominios uc
  WHERE uc.id_condominio = 4
    AND uc.rol = 'CONDOMINO'
    AND uc.estado = 'ACTIVO'
) AS m
JOIN votaciones vo
  ON vo.id_condominio = 4
 AND vo.estado = 'ABIERTA'
ON CONFLICT (id_votacion, id_usuario_condominio) DO NOTHING;

-- Gastos ---------------------------------------------------------------------
INSERT INTO gastos (concepto, categoria, monto, fecha, proveedor, nota, url_comprobante, id_condominio)
SELECT v.concepto, v.categoria, v.monto,
       CURRENT_TIMESTAMP - (v.dias || ' days')::interval,
       v.proveedor, v.nota, NULL, 4
FROM (VALUES
  ('Servicio de jardineria mensual', 'Jardinería',  5400.00, 'VerdeVivo S.A. de C.V.', 'Poda de pasto, setos y palmeras.', 8),
  ('Servicio de limpieza de areas comunes', 'Limpieza', 12800.00, 'BrillaMax S.A. de C.V.', 'Pasillos, escaleras, lobby y estacionamiento.', 12),
  ('Consumo de energia electrica del bimestre', 'Suministros', 11890.00, 'CFE', 'Medidor de areas comunes.', 18),
  ('Nomina de seguridad', 'Seguridad', 22000.00, 'GuardPro S.A. de C.V.', 'Tres elementos en turnos de 12 horas.', 22),
  ('Mantenimiento preventivo de elevador', 'Mantenimiento', 7200.00, 'Ascensores Modernos S.A.', 'Servicio bimestral del contrato vigente.', 30),
  ('Suministro de agua potable', 'Suministros', 8600.00, 'Organismo operador', 'Consumo de areas comunes.', 38),
  ('Fumigacion de areas comunes', 'Fumigación', 6500.00, 'AntiPlagas', 'Cucarachas, hormigas y mosquitos.', 46),
  ('Reparacion de porton automatico', 'Reparaciones', 4200.00, 'Automatismos del Norte', 'Cambio de motor y sensor de seguridad.', 58)
) AS v(concepto, categoria, monto, proveedor, nota, dias)
WHERE NOT EXISTS (
  SELECT 1 FROM gastos g WHERE g.id_condominio = 4 AND g.concepto = v.concepto
);

-- Reportes financieros de los ultimos 3 meses --------------------------------
INSERT INTO reportes_financieros
  (periodo, fecha_generacion, total_ingresos, total_gastos, total_adeudos, url_pdf, url_excel, id_condominio)
SELECT p.periodo,
       (date_trunc('month', to_date(p.periodo, 'YYYY-MM')) + INTERVAL '1 month' - INTERVAL '1 second'),
       COALESCE((SELECT SUM(pg.monto) FROM pagos pg
                 JOIN cuotas c ON c.id_cuota = pg.id_cuota
                 WHERE c.id_condominio = 4 AND pg.estado = 'VALIDADO'
                   AND c.periodo = p.periodo), 0),
       COALESCE((SELECT SUM(g.monto) FROM gastos g
                 WHERE g.id_condominio = 4
                   AND to_char(g.fecha, 'YYYY-MM') = p.periodo), 0),
       COALESCE((SELECT SUM(c.monto_base) FROM cuotas c
                 WHERE c.id_condominio = 4 AND c.periodo = p.periodo AND c.estado <> 'PAGADA'), 0),
       NULL, NULL, 4
FROM (
  SELECT to_char(date_trunc('month', CURRENT_DATE) - (n || ' months')::interval, 'YYYY-MM') AS periodo
  FROM generate_series(0, 2) AS n
) AS p
ON CONFLICT (id_condominio, periodo) DO NOTHING;

COMMIT;

-- ============================================================================
-- Verificacion rapida
-- ============================================================================
-- SELECT u.correo, un.clave_unidad,
--        count(*) AS cuotas,
--        count(*) FILTER (WHERE c.estado = 'PAGADA') AS pagadas,
--        count(p.id_pago) AS con_pago,
--        count(*) FILTER (WHERE p.id_pago IS NULL) AS sin_pago
-- FROM cuotas c
-- JOIN unidades un ON un.id_unidad = c.id_unidad
-- JOIN unidades_ocupantes uo ON uo.id_unidad = un.id_unidad AND uo.fecha_fin IS NULL
-- JOIN usuarios_condominios uc ON uc.id_usuario_condominio = uo.id_usuario_condominio
-- JOIN usuarios u ON u.id_usuario = uc.id_usuario
-- LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
-- WHERE c.id_condominio = 4
-- GROUP BY 1, 2
-- ORDER BY 1;

-- ============================================================================
-- Limpieza (ejecutar solo si quieres borrar TODO lo generado por este script)
-- Descomenta y ejecuta en este orden.
-- ============================================================================
-- BEGIN;
-- DELETE FROM recibos    WHERE id_pago IN (
--   SELECT p.id_pago FROM pagos p JOIN cuotas c ON c.id_cuota = p.id_cuota
--   WHERE c.id_condominio = 4);
-- DELETE FROM evidencias_pago WHERE id_pago IN (
--   SELECT p.id_pago FROM pagos p JOIN cuotas c ON c.id_cuota = p.id_cuota
--   WHERE c.id_condominio = 4);
-- DELETE FROM pagos      WHERE id_cuota IN (SELECT id_cuota FROM cuotas WHERE id_condominio = 4);
-- DELETE FROM cuotas     WHERE id_condominio = 4;
-- DELETE FROM reportes_financieros WHERE id_condominio = 4;
-- DELETE FROM gastos     WHERE id_condominio = 4;
-- DELETE FROM votos      WHERE id_votacion IN (SELECT id_votacion FROM votaciones WHERE id_condominio = 4);
-- DELETE FROM votaciones WHERE id_condominio = 4;
-- DELETE FROM avisos     WHERE id_condominio = 4;
-- DELETE FROM estado_cuenta WHERE id_unidad IN (SELECT id_unidad FROM unidades WHERE id_condominio = 4);
-- DELETE FROM unidades_ocupantes WHERE id_unidad IN (SELECT id_unidad FROM unidades WHERE id_condominio = 4);
-- DELETE FROM unidades   WHERE id_condominio = 4;
-- COMMIT;

