import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CuotasService } from './cuotas.service';

@Controller('cuotas')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class CuotasController {
  constructor(private readonly cuotasService: CuotasService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cuotasService.listByCondominio(idCondominio);
  }

  @Get('condomino')
  @UseGuards(JwtAuthGuard, CondominioAccessGuard)
  listByCondomino(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idUsuarioCondominio', ParseIntPipe) idUsuarioCondominio: number,
  ) {
    return this.cuotasService.listByCondomino(idCondominio, idUsuarioCondominio);
  }
}