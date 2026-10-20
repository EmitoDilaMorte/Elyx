import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CuotaEstado, CuotasService } from './cuotas.service';

@Controller('cuotas')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class CuotasController {
  constructor(private readonly cuotasService: CuotasService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cuotasService.listByCondominio(idCondominio);
  }

  /** Listado paginado con busqueda, filtro y orden (punto 5 de la rubrica). */
  @Get('paginado')
  listarPaginado(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(12), ParseIntPipe) pageSize: number,
    @Query('q') q?: string,
    @Query('estado') estado?: string,
    @Query('orden') orden?: string,
    @Query('idUsuarioCondominio') idUsuarioCondominio?: string,
  ) {
    const estadosValidos: CuotaEstado[] = ['PENDIENTE', 'EN_VALIDACION', 'PAGADA'];
    const estadoFiltrado = estadosValidos.includes(estado as CuotaEstado)
      ? (estado as CuotaEstado)
      : null;
    const usuario = Number(idUsuarioCondominio);

    return this.cuotasService.listarPaginado({
      idCondominio,
      idUsuarioCondominio: Number.isInteger(usuario) && usuario > 0 ? usuario : null,
      page,
      pageSize,
      q: q?.slice(0, 80),
      estado: estadoFiltrado,
      orden,
    });
  }

  @Get('condomino')
  @UseGuards(JwtAuthGuard, CondominioAccessGuard)
  listByCondomino(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idUsuarioCondominio', ParseIntPipe) idUsuarioCondominio: number,
  ) {
    return this.cuotasService.listByCondomino(idCondominio, idUsuarioCondominio);
  }
}