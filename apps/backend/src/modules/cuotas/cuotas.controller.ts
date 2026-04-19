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
}