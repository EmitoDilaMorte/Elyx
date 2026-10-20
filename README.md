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

## Seguridad y verificaciones automaticas

Elyx expone barreras reales que cualquier analizador puede observar y demostrar:

- **Sesiones**: access token corto (`ACCESS_TOKEN_TTL=15m`) + refresh token rotatorio en cookie `HttpOnly` (`elyx_rt`, `SameSite=Strict`). Rotacion con deteccion de reuso en `refresh_tokens`.
- **CSRF**: doble envio con cookie `elyx_csrf` y cabecera `X-CSRF-Token`; el guard global valida todos los metodos mutantes. El token rota al iniciar sesion.
- **Segundo CAPTCHA propio**: operacion matematica de un solo uso (`GET /api/captcha/challenge`). Visible en el login y obligatoria tras 3 fallos (`CAPTCHA_MATH_ENFORCE=after_failures`); siempre obligatoria en recuperacion de contrasena.
- **Telemetria de comportamiento**: `POST /api/behavior` recibe lotes de eventos (sin valores de campos) y devuelve `score`, `verdict` y motivos. El login incluye `behaviorSessionId` y expone `X-Behavior-Score`. `BEHAVIOR_ENFORCE=soft` solo mide; `strict` rechaza sesiones clasificadas como bot.
- **MFA**: TOTP compatible con Microsoft Authenticator (`/api/auth/mfa/setup|enable|verify|disable`) y OTP de 6 digitos por correo como alternativa. Desactivado por usuario hasta que se activa desde el perfil.
- **Robots**: `apps/frontend/public/robots.txt` declara 3 rutas privadas y `Crawl-delay: 2`.

### Endpoints nuevos

| Metodo | Ruta | Notas |
|---|---|---|
| GET | `/api/auth/csrf` | Devuelve el token vigente y solo emite uno nuevo si la cookie falta o no es valida |
| POST | `/api/auth/refresh` | Rota el refresh token (cookie `elyx_rt`) |
| POST | `/api/auth/logout` | Revoca la sesion persistente |
| GET | `/api/captcha/challenge` | Operacion matematica de un solo uso |
| POST | `/api/behavior` | Telemetria y scoring (publico, con throttle) |
| POST | `/api/auth/mfa/verify` | Segundo factor (TOTP o correo) |
| POST | `/api/auth/mfa/resend` | Reenvia el OTP por correo |

### Demostracion

1. `docker compose up --build` y abrir http://localhost:5173.
2. `curl http://localhost:5173/robots.txt` debe mostrar 3 `Disallow` y `Crawl-delay: 2`.
3. Iniciar sesion y comprobar en DevTools las cookies `elyx_rt` (HttpOnly) y `elyx_csrf`, y la peticion `POST /api/behavior`.
4. En **Perfil > Autenticacion en dos pasos** activar MFA escaneando el codigo QR con Microsoft Authenticator (o capturando el secreto manual si no puedes escanear).
5. Ejecutar el bot de la rubrica: `python bot.py --url http://localhost:5173 --navegador chrome --sigiloso`.

> Importante: para que el script inline de telemetria contenga una URL absoluta (requisito del detector del bot), define `VITE_API_URL` en el frontend. `docker-compose.yml` ya lo hace.

### Configuracion relevante

- `CORS_ALLOWED_ORIGINS`: lista separada por comas. El backend anade automaticamente la variante con/sin `www.`.
- `CSRF_SECRET`, `MFA_ENCRYPTION_KEY`, `COOKIE_SECURE`, `REFRESH_TOKEN_TTL_DAYS`.
- `CAPTCHA_MATH_ENABLED`, `CAPTCHA_MATH_ENFORCE`, `BEHAVIOR_ENFORCE`.
- Tras actualizar una base existente, aplicar `apps/backend/src/database/migrations/20261019_seguridad_refresh_behavior_mfa.sql`.
