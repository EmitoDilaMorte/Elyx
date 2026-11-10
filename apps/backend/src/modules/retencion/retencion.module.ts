import { Module } from '@nestjs/common';
import { RetencionService } from './retencion.service';

/**
 * Cumple los plazos de conservacion de `docs/politica-privacidad.md`.
 *
 * No expone endpoints: se ejecuta por cron. Vive en su propio modulo para que
 * activarlo o quitarlo no obligue a tocar `SuscripcionesModule`, que ya carga
 * bastantes responsabilidades.
 */
@Module({
  providers: [RetencionService],
})
export class RetencionModule {}
