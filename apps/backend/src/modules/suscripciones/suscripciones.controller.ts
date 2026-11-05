import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import {
  CambiarEstadoSuscripcionDto,
  ConfirmarPagoSuscripcionDto,
} from './dto/suscripciones.dto';
import {
  ActualizarDatosFiscalesDto,
  SincronizarUnidadesDto,
} from './dto/facturacion.dto';
import { SuscripcionesService } from './suscripciones.service';

type AuthRequest = { user?: { sub?: number } };

@Controller('suscripciones')
@UseGuards(JwtAuthGuard)
export class SuscripcionesController {
  constructor(private readonly suscripcionesService: SuscripcionesService) {}

  /** Administrador: estado de la suscripcion de su condominio. */
  @Get('mia')
  @UseGuards(CondominioAccessGuard)
  mia(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.suscripcionesService.obtenerMia(idCondominio);
  }

  /** Administrador: cobro pendiente con instrucciones de pago. */
  @Post('mia/cobro')
  @UseGuards(CondominioAccessGuard, RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crearCobro(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.suscripcionesService.crearCobroPendiente(idCondominio);
  }

  /**
   * Portal de cliente de Stripe: tarjeta, facturas y cancelacion sin pasar por
   * Elyx. Solo aplica al proveedor STRIPE.
   */
  @Post('mia/portal')
  @UseGuards(CondominioAccessGuard, RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  portal(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.suscripcionesService.crearPortalCliente(idCondominio);
  }

  /** Datos fiscales para el CFDI (hoy solo se capturan). */
  @Get('mia/datos-fiscales')
  @UseGuards(CondominioAccessGuard)
  datosFiscales(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.suscripcionesService.obtenerDatosFiscales(idCondominio);
  }

  @Patch('mia/datos-fiscales')
  @UseGuards(CondominioAccessGuard, RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  actualizarDatosFiscales(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Body() dto: ActualizarDatosFiscalesDto,
  ) {
    return this.suscripcionesService.actualizarDatosFiscales(idCondominio, dto);
  }

  /**
   * Ajusta la cantidad facturada en Stripe con prorrateo. Se llama cuando el
   * condominio cambia sus unidades contratadas.
   */
  @Patch('mia/unidades')
  @UseGuards(CondominioAccessGuard, RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  sincronizarUnidades(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Body() dto: SincronizarUnidadesDto,
  ) {
    return this.suscripcionesService.sincronizarCantidad(idCondominio, dto.unidades);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  listar() {
    return this.suscripcionesService.listarTodas();
  }

  @Get(':idSuscripcion/pagos')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  pagos(@Param('idSuscripcion', ParseIntPipe) idSuscripcion: number) {
    return this.suscripcionesService.listarPagos(idSuscripcion);
  }

  @Get(':idSuscripcion/proveedor')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  estadoProveedor(@Param('idSuscripcion', ParseIntPipe) idSuscripcion: number) {
    return this.suscripcionesService.estadoProveedor(idSuscripcion);
  }

  @Patch(':idSuscripcion/confirmar-pago')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  confirmarPago(
    @Param('idSuscripcion', ParseIntPipe) idSuscripcion: number,
    @Req() req: AuthRequest,
    @Body() dto: ConfirmarPagoSuscripcionDto,
  ) {
    return this.suscripcionesService.confirmarPago(idSuscripcion, Number(req.user?.sub), dto);
  }

  @Patch(':idSuscripcion/estado')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERUSER)
  cambiarEstado(
    @Param('idSuscripcion', ParseIntPipe) idSuscripcion: number,
    @Body() dto: CambiarEstadoSuscripcionDto,
  ) {
    return this.suscripcionesService.cambiarEstado(idSuscripcion, dto.estado);
  }
}
