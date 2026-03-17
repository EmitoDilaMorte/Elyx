# Estructura base de Elyx

## Monorepo

- `apps/frontend`: React + Vite
- `apps/backend`: NestJS + TypeORM
- `infra/postgres/init`: SQL de inicializacion
- `docs`: documentacion tecnica

## Backend por dominio

- `usuarios`
- `condominos`
- `administradores`
- `cuotas`
- `pagos`
- `recibos`
- `evidencias-pago`
- `avisos`
- `votaciones`
- `votos`
- `reportes-mantenimiento`
- `config-notificaciones`
- `notificaciones`
- `gastos`
- `reportes-financieros`

## Base de datos

`infra/postgres/init/01_schema.sql` incluye tablas con base en el ER:

- usuarios, condominos, administradores
- estado_cuenta, cuotas, pagos
- evidencias_pago, recibos
- avisos, votaciones, votos
- reportes_mantenimiento
- config_notificaciones, notificaciones
- gastos
- reportes_financieros, reporte_financiero_detalle

## Reglas clave implementadas

- Sin pagos parciales: `pagos.id_cuota` es UNIQUE.
- Sin multiples evidencias por pago: `evidencias_pago.id_pago` es UNIQUE.
- Sin multiples recibos por pago: `recibos.id_pago` es UNIQUE.
- Voto unico por condominio y votacion: UNIQUE `(id_votacion, id_condomino)`.
- Detalle financiero con XOR: `id_pago` o `id_gasto` (uno y solo uno).
