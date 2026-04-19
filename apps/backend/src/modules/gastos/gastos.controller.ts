import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { GastosService } from './gastos.service';

@Controller('gastos')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.gastosService.listByCondominio(idCondominio);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  create(@Body() dto: CreateGastoDto) {
    return this.gastosService.create(dto);
  }
}