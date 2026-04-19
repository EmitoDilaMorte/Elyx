import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';
import { UpdateCondominioEstadoDto } from './dto/update-condominio-estado.dto';
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
