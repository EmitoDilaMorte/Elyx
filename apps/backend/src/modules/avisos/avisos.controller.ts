import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateAvisoDto } from './dto/create-aviso.dto';
import { AvisosService } from './avisos.service';

@Controller('avisos')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.avisosService.findByCondominio(idCondominio);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  create(@Body() dto: CreateAvisoDto) {
    return this.avisosService.create(dto);
  }
}