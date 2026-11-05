import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';
import { UpdateCondominioEstadoDto } from './dto/update-condominio-estado.dto';
import { UpdateMembresiaRolDto } from './dto/update-membresia-rol.dto';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
@UseGuards(JwtAuthGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post('onboarding-inicial')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  createOnboarding(@Body() dto: CreateOnboardingDto) {
    return this.usuariosService.createOnboardingInicial(dto);
  }

  @Get('super/condominios')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  listSuperCondominios() {
    return this.usuariosService.listSuperCondominios();
  }

  @Get('super/condominios/:idCondominio/miembros')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  listMembresias(@Param('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.usuariosService.listMembresias(idCondominio);
  }

  /**
   * Ascender o degradar a un administrador. La votacion especial del condominio
   * se montara encima de este endpoint; el superusuario es la autoridad final
   * para cuando la votacion no pueda celebrarse (por ejemplo, sin admins).
   */
  @Patch('super/condominios/:idCondominio/miembros/:idUsuarioCondominio/rol')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  updateMembresiaRol(
    @Param('idCondominio', ParseIntPipe) idCondominio: number,
    @Param('idUsuarioCondominio', ParseIntPipe) idUsuarioCondominio: number,
    @Body() dto: UpdateMembresiaRolDto,
  ) {
    return this.usuariosService.updateMembresiaRol(idCondominio, idUsuarioCondominio, dto.rol);
  }

  @Patch('super/condominios/:idCondominio/estado')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  updateCondominioEstado(
    @Param('idCondominio', ParseIntPipe) idCondominio: number,
    @Body() dto: UpdateCondominioEstadoDto,
  ) {
    return this.usuariosService.updateCondominioEstado(idCondominio, dto.estado);
  }
}
