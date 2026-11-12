import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CuotasService } from './cuotas.service';

/**
 * Estado de cuenta del condomino.
 *
 * Vive en su propio controlador (y no en `CuotasController`) porque no lista
 * cuotas: devuelve un resumen calculado. La ruta `/estado-cuenta` es la que
 * documenta el proyecto.
 */
@Controller('estado-cuenta')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class EstadoCuentaController {
  constructor(private readonly cuotasService: CuotasService) {}

  @Get()
  obtener(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idUsuarioCondominio', ParseIntPipe) idUsuarioCondominio: number,
  ) {
    return this.cuotasService.estadoCuenta(idCondominio, idUsuarioCondominio);
  }
}
