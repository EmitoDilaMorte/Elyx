import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicoService } from './publico.service';

/**
 * Pagina publica del condominio.
 *
 * Sin autenticacion y sin CSRF (solo GET). Es la URL que se declara a Stripe
 * como `business_url`, asi que **debe cargar sin credenciales**: Stripe la
 * revisa periodicamente para confirmar que el negocio existe y que la
 * descripcion coincide con lo declarado.
 *
 * El throttle es el mismo que el del enlace de invitacion. La pagina es publica
 * y sin limite seria un vector de enumeracion de condominios.
 */
@Controller('publico')
export class PublicoController {
  constructor(private readonly publicoService: PublicoService) {}

  /** Datos publicos del condominio. 404 si no existe o su pagina esta apagada. */
  @Get('condominios/:id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  condominio(@Param('id', ParseIntPipe) id: number) {
    return this.publicoService.obtenerCondominio(id);
  }

  /**
   * Resuelve un enlace de invitacion.
   *
   * Devuelve el condominio **y** el estado del enlace, porque la URL
   * `/invitacion/:token` no conoce el id del condominio. Nunca lanza por un
   * token vencido o revocado: devuelve el estado con un motivo legible.
   */
  @Get('invitaciones/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  invitacion(@Param('token') token: string) {
    return this.publicoService.obtenerPaginaInvitacion(token ?? '');
  }
}
