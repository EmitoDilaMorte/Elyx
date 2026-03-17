# Elyx

Monorepo base para la aplicacion Elyx con:

- Frontend: React + Vite + TypeScript
- Backend: NestJS + TypeScript + TypeORM
- Base de datos: PostgreSQL
- Orquestacion: Docker Compose

## Estructura

- `apps/frontend`: aplicacion web de condominio
- `apps/backend`: API REST en NestJS
- `infra/postgres/init`: scripts SQL de inicializacion
- `docs`: notas de arquitectura y dominio

## Inicio rapido

1. Copiar variables:

```bash
cp .env.example .env
```

2. Levantar servicios:

```bash
docker compose up --build
```

3. URLs:

- Frontend: http://localhost:5173
- Backend: http://localhost:3000/api
- Health backend: http://localhost:3000/api/health

## Dominio inicial incluido

Se prepararon tablas/modulos base para:

- Usuarios, condominos y administradores
- Estado de cuenta, cuotas y pagos
- Evidencias de pago y recibos
- Avisos, votaciones y votos
- Reportes de mantenimiento
- Configuracion y notificaciones
- Gastos
- Reportes financieros y detalle
