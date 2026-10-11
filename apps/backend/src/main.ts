import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * CORS con allowlist explícita:
 *  - `CORS_ALLOWED_ORIGINS` (lista separada por comas) tiene prioridad.
 *  - Si está vacía se usa `FRONTEND_URL`.
 *  - Fuera de producción se añaden los orígenes locales de Vite.
 * Nunca se refleja un origen arbitrario ni se usa el comodín `*`.
 */
function buildCorsOptions(): CorsOptions {
  const allowedOrigins = new Set<string>();

  for (const origin of (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',')) {
    const limpio = origin.trim();
    if (limpio.length > 0) {
      allowedOrigins.add(limpio);
    }
  }

  const frontendUrl = (process.env.FRONTEND_URL ?? '').trim();
  if (frontendUrl.length > 0) {
    allowedOrigins.add(frontendUrl);
  }

  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://127.0.0.1:5173');
  }

  const origins = Array.from(allowedOrigins);

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Sin cabecera Origin (curl, apps moviles, mismo origen): se permite.
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Origen no autorizado: se omite la cabecera CORS sin lanzar error 500.
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400,
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  // Necesario para que `req.ip` sea la IP real del visitante cuando la app
  // corre detras de un reverse proxy o de Cloudflare.
  app.set('trust proxy', 'loopback');

  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const uploadsDir = join(process.cwd(), 'uploads');
  const evidenciasDir = join(uploadsDir, 'evidencias');
  const incidenciasDir = join(uploadsDir, 'incidencias');
  const reparacionesDir = join(uploadsDir, 'reparaciones');
  if (!existsSync(evidenciasDir)) {
    mkdirSync(evidenciasDir, { recursive: true });
  }
  if (!existsSync(incidenciasDir)) {
    mkdirSync(incidenciasDir, { recursive: true });
  }
  if (!existsSync(reparacionesDir)) {
    mkdirSync(reparacionesDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
