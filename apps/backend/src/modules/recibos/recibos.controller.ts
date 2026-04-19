import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { GenerarReciboDto } from './dto/generar-recibo.dto';
import { RecibosService } from './recibos.service';

@Controller('recibos')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class RecibosController {
  constructor(private readonly recibosService: RecibosService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idPago', new ParseIntPipe({ optional: true })) idPago?: number,
  ) {
    return this.recibosService.listByCondominio(idCondominio, idPago);
  }

  @Post('generar')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  generar(@Body() dto: GenerarReciboDto) {
    return this.recibosService.generar(dto);
  }
}
