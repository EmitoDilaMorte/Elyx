import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { UnidadesService } from './unidades.service';

// Importa CondominioAccessGuard desde su ubicación real.
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';

@Controller('unidades')
@UseGuards(JwtAuthGuard)
export class UnidadesController {
  constructor(private readonly unidadesService: UnidadesService) {}

  @Get('usuario-condominio/:idUsuarioCondominio')
  @UseGuards(CondominioAccessGuard)
  async getUnidadByUsuarioCondominio(
    @Param('idUsuarioCondominio', ParseIntPipe)
    idUsuarioCondominio: number,
  ) {
    return this.unidadesService.getUnidadByUsuarioCondominio(
      idUsuarioCondominio,
    );
  }
}