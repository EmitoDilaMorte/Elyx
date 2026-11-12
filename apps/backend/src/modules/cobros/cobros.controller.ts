import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CobrosService } from './cobros.service';
import { CobrosStripeService } from './cobros-stripe.service';
import { ConnectService } from './connect.service';
import {
  ActualizarConfiguracionCobroDto,
  ConfirmarCargoSpeiDto,
  CrearCargoDto,
} from './dto/cobros.dto';

/**
 * Cobro de cuotas del condominio.
 *
 * El administrador configura como cobrar y concilia los pagos por SPEI; el
 * condomino consulta los datos para pagar su cuota.
 */
@Controller('cobros')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class CobrosController {
  constructor(
    private readonly cobrosService: CobrosService,
    private readonly connectService: ConnectService,
    private readonly cobrosStripe: CobrosStripeService,
  ) {}

  /** Administrador: como cobra este condominio y si puede usar cada metodo. */
  @Get('configuracion')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  configuracion(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cobrosService.obtenerConfiguracion(idCondominio);
  }

  /**
   * Administrador: guarda la configuracion.
   *
   * Si pide `STRIPE_CONNECT` sin RFC responde 403 `RFC_REQUERIDO_PARA_CONNECT`
   * con el motivo y la alternativa SPEI. Nunca se llega a Stripe.
   */
  @Patch('configuracion')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  actualizarConfiguracion(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Body() dto: ActualizarConfiguracionCobroDto,
  ) {
    return this.cobrosService.actualizarConfiguracion(idCondominio, dto);
  }

  /**
   * Condomino o administrador: datos para pagar una cuota.
   *
   * Reutiliza el cargo vigente si existe, para que la referencia SPEI no cambie
   * entre visitas y el condomino no pague dos veces.
   */
  @Get('cuota/:idCuota')
  datosPagoCuota(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Param('idCuota', ParseIntPipe) idCuota: number,
  ) {
    return this.cobrosService.datosPagoCuota(idCondominio, idCuota);
  }

  /** Alias explicito para crear el cargo (misma logica que el GET). */
  @Post('cargo')
  crearCargo(@Body() dto: CrearCargoDto) {
    return this.cobrosService.datosPagoCuota(dto.idCondominio, dto.idCuota);
  }

  /**
   * Crea el cobro con tarjeta y devuelve el `clientSecret` del checkout
   * embebido. Requiere que la cuenta Connect del condominio pueda cobrar.
   *
   * El cargo NO se marca pagado aqui: eso lo confirma el webhook de Connect
   * cuando Stripe reporta el pago. La respuesta del navegador no es confiable.
   */
  @Post('cargo/tarjeta')
  crearCargoTarjeta(@Body() dto: CrearCargoDto) {
    return this.cobrosStripe.crearCobroTarjeta(dto.idCondominio, dto.idCuota);
  }

  /**
   * Administrador: concilia un cargo SPEI (el dinero ya llego a su cuenta).
   *
   * Marca el cargo PAGADO, crea el pago y deja la cuota PAGADA, igual que
   * aprobar un comprobante.
   */
  @Patch('cargo/spei/confirmar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  confirmarCargoSpei(@Body() dto: ConfirmarCargoSpeiDto) {
    return this.cobrosService.confirmarCargoSpei(dto);
  }

  /**
   * Administrador: cargos SPEI pendientes de conciliar.
   *
   * Se muestran junto a la configuracion de cobro; sin esta lista el
   * administrador tendria que adivinar el `idCargo` para confirmar.
   */
  @Get('cargos/pendientes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  cargosPendientes(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cobrosService.cargosPendientesSpei(idCondominio);
  }

  /**
   * Condomino o administrador: estado de una cuota frente a su cargo.
   *
   * El frontend lo consulta al regresar del checkout de Stripe, porque el pago
   * se confirma por webhook y no por la respuesta del navegador.
   */
  @Get('cargo/estado')
  estadoCargo(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idCuota', ParseIntPipe) idCuota: number,
  ) {
    return this.cobrosService.estadoCargoCuota(idCondominio, idCuota);
  }

  // ---------------------------------------------------------------------------
  // Stripe Connect
  // ---------------------------------------------------------------------------

  /** Administrador: estado real de la cuenta conectada (consultado a Stripe). */
  @Get('connect/estado')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  estadoConnect(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.connectService.consultarEstado(idCondominio);
  }

  /**
   * Administrador: crea (o reutiliza) la cuenta conectada del condominio.
   *
   * No devuelve el objeto crudo de Stripe, solo el estado utilizable.
   */
  @Post('connect/cuenta')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crearCuentaConnect(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.connectService.crearOReutilizarCuenta(idCondominio);
  }

  /**
   * Administrador: enlace de onboarding hospedado por Stripe.
   *
   * El frontend redirige a `url`. Stripe recoge ahi el RFC, la cuenta bancaria
   * y la verificacion de identidad; Elyx nunca ve esos datos.
   */
  @Post('connect/enlace')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crearEnlaceConnect(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.connectService.crearEnlaceOnboarding(idCondominio);
  }
}
