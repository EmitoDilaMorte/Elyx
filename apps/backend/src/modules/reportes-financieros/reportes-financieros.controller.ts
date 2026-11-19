import { Controller, Get, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ReportesFinancierosService } from './reportes-financieros.service';
import type { RolReporte } from './reportes-financieros.types';

/**
 * `sub` es el id de USUARIO; el condomino se identifica por MEMBRESIA. El JWT
 * ya trae la lista de membresias, asi que la traduccion no necesita otra
 * consulta a la base.
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

@Controller('reportes-financieros')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class ReportesFinancierosController {
  constructor(private readonly reportesFinancierosService: ReportesFinancierosService) {}

  @Get()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.reportesFinancierosService.listByCondominio(idCondominio);
  }

  /**
   * Reporte detallado (KPIs, series, desgloses y movimientos).
   *
   * El rol se deduce de la membresia EN ESE condominio: un administrador del
   * condominio A que solo es condomino en B recibe el reporte de B sin cartera
   * ni datos de otras unidades. El superusuario se trata como administrador,
   * igual que `RolesGuard`.
   *
   * `periodos` acepta `?periodos=2026-10,2026-11` o el parametro repetido.
   * Vacio = todos los periodos con informacion.
   */
  @Get('resumen')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  resumen(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('periodos') periodos: string | string[] | undefined,
    @Req() req: AuthRequest,
  ) {
    const { rol, idUsuarioCondominio } = this.contexto(req, idCondominio);
    const lista = Array.isArray(periodos) ? periodos : periodos ? [periodos] : null;

    return this.reportesFinancierosService.resumen(idCondominio, {
      periodos: lista,
      rol,
      idUsuarioCondominio,
    });
  }

  /** Rol efectivo y membresia del usuario en el condominio consultado. */
  private contexto(
    req: AuthRequest,
    idCondominio: number,
  ): { rol: RolReporte; idUsuarioCondominio: number | null } {
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
