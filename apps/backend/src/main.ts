import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
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
