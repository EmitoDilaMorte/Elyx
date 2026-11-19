import { Body, Controller, Get, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { GenerarReciboDto } from './dto/generar-recibo.dto';
import { RecibosService, type ContextoRecibo } from './recibos.service';

/**
 * `sub` es el id de USUARIO; el recibo se filtra por MEMBRESIA. El JWT ya trae
 * la lista de membresias, asi que la traduccion no necesita otra consulta.
 */
type AuthRequest = {
  user?: {
    isSuperuser?: boolean;
    memberships?: Array<{
      idUsuarioCondominio: number;
      idCondominio: number;
      rol: string;
    }>;
  };
};

@Controller('recibos')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class RecibosController {
  constructor(private readonly recibosService: RecibosService) {}

  /**
   * Recibos emitidos. El condomino solo recibe los suyos; el administrador ve
   * todos los del condominio.
   */
  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idPago', new ParseIntPipe({ optional: true })) idPago: number | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.recibosService.listByCondominio(
      idCondominio,
      this.contexto(req, idCondominio),
      idPago,
    );
  }

  @Post('generar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  generar(@Body() dto: GenerarReciboDto, @Req() req: AuthRequest) {
    return this.recibosService.generar(dto, this.contexto(req, dto.idCondominio));
  }

  /**
   * Rol efectivo y membresia del usuario en el condominio.
   *
   * Un administrador del condominio A que solo es condomino en B recibe el rol
   * de B: el rol global no autoriza a leer pagos ajenos.
   */
  private contexto(req: AuthRequest, idCondominio: number): ContextoRecibo {
    const membresia = (req.user?.memberships ?? []).find(
      (item) => Number(item.idCondominio) === idCondominio,
    );

    if (req.user?.isSuperuser || membresia?.rol === 'ADMINISTRADOR') {
      return {
        rol: 'ADMINISTRADOR',
        idUsuarioCondominio: membresia ? Number(membresia.idUsuarioCondominio) : null,
      };
    }

    return {
      rol: 'CONDOMINO',
      idUsuarioCondominio: membresia ? Number(membresia.idUsuarioCondominio) : null,
    };
  }
}
