import { Body, Controller, Get, ParseEnumPipe, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { VotacionEstado } from '../../common/enums/votacion-estado.enum';
import { CerrarVotacionDto } from './dto/cerrar-votacion.dto';
import { CreateCambioCuotaVotacionDto, EjecutarCambioCuotaDto } from './dto/create-cambio-cuota-votacion.dto';
import { CreateVotacionDto } from './dto/create-votacion.dto';
import { VotarVotacionDto } from './dto/votar-votacion.dto';
import { VotacionesService } from './votaciones.service';

@Controller('votaciones')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class VotacionesController {
  constructor(private readonly votacionesService: VotacionesService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('estado', new ParseEnumPipe(VotacionEstado, { optional: true })) estado?: VotacionEstado,
  ) {
    return this.votacionesService.listByCondominio(idCondominio, estado);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  create(@Body() dto: CreateVotacionDto) {
    return this.votacionesService.create(dto);
  }

  @Post('cambio-cuota')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  createCambioCuota(@Body() dto: CreateCambioCuotaVotacionDto) {
    return this.votacionesService.createCambioCuota(dto);
  }

  @Post('votar')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  votar(@Body() dto: VotarVotacionDto) {
    return this.votacionesService.votar(dto);
  }

  @Patch('cerrar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  cerrar(@Body() dto: CerrarVotacionDto) {
    return this.votacionesService.cerrar(dto);
  }

  @Get('cambios-cuota')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  listCambiosCuota(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.votacionesService.listCambiosCuota(idCondominio);
  }

  @Patch('cambio-cuota/ejecutar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  ejecutarCambioCuota(@Body() dto: EjecutarCambioCuotaDto) {
    return this.votacionesService.ejecutarCambioCuota(dto);
  }
}