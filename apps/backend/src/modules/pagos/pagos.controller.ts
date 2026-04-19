import { Body, Controller, Get, ParseEnumPipe, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { PagoEstado } from '../../common/enums/pago-estado.enum';
import { AprobarPagoDto, RechazarPagoDto } from './dto/actualizar-pago.dto';
import { CapturarPagoDto } from './dto/capturar-pago.dto';
import { PagosService } from './pagos.service';

@Controller('pagos')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('estado', new ParseEnumPipe(PagoEstado, { optional: true })) estado?: PagoEstado,
  ) {
    return this.pagosService.listByCondominio(idCondominio, estado);
  }

  @Patch('capturar')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  capturar(@Body() dto: CapturarPagoDto) {
    return this.pagosService.capturar(dto);
  }

  @Patch('aprobar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  aprobar(@Body() dto: AprobarPagoDto) {
    return this.pagosService.aprobar(dto);
  }

  @Patch('rechazar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  rechazar(@Body() dto: RechazarPagoDto) {
    return this.pagosService.rechazar(dto);
  }
}