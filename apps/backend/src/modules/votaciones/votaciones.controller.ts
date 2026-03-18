import { Body, Controller, Get, ParseEnumPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { VotacionEstado } from '../../common/enums/votacion-estado.enum';
import { CerrarVotacionDto } from './dto/cerrar-votacion.dto';
import { CreateVotacionDto } from './dto/create-votacion.dto';
import { VotarVotacionDto } from './dto/votar-votacion.dto';
import { VotacionesService } from './votaciones.service';

@Controller('votaciones')
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
  create(@Body() dto: CreateVotacionDto) {
    return this.votacionesService.create(dto);
  }

  @Post('votar')
  votar(@Body() dto: VotarVotacionDto) {
    return this.votacionesService.votar(dto);
  }

  @Patch('cerrar')
  cerrar(@Body() dto: CerrarVotacionDto) {
    return this.votacionesService.cerrar(dto);
  }
}