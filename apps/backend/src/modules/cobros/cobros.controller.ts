import {
  Body,
  Controller,
  Delete,
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
import { CobrosService } from './cobros.service';
import { CobrosStripeService } from './cobros-stripe.service';
import { ConnectService } from './connect.service';
import { DepositosService } from './depositos.service';
import {
  ActualizarConfiguracionCobroDto,
  ConfirmarCargoSpeiDto,
  CrearCargoDto,
  CrearCargoMetodoDto,
} from './dto/cobros.dto';

/**
 * `sub` es el id de USUARIO; las tarjetas guardadas se mapean por MEMBRESIA
 * (`id_usuario_condominio`). El JWT ya trae la lista de membresias, asi que la
 * traduccion no necesita otra consulta a la base.
 */
type AuthRequest = {
  user?: {
    sub?: number;
    memberships?: Array<{ idUsuarioCondominio: number; idCondominio: number; rol: string }>;
  };
};

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
    private readonly depositos: DepositosService,
  ) {}

  /** Administrador: como cobra este condominio y si puede usar cada metodo. */
  @Get('configuracion')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  configuracion(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cobrosService.obtenerConfiguracion(idCondominio);
  }

  /**
   * Condomino o administrador: metodos de pago que ofrece el condominio.
   *
   * Sin `RolesGuard` a proposito: quien debe saber que botones mostrar es el
   * condomino, y `GET /cobros/configuracion` es solo para el administrador
   * porque incluye CLABE, comisiones y datos de la cuenta de Stripe.
   */
  @Get('metodos')
  metodos(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cobrosService.metodosDeCondominio(idCondominio);
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
   * Condomino o administrador: opciones de pago de una cuota.
   *
   * Devuelve que metodos estan activos **sin crear cargos**. El cargo se crea
   * al elegir, para que tener SPEI y tarjeta a la vez no se estorbe (un solo
   * cargo PENDIENTE por cuota).
   */
  @Get('cuota/:idCuota')
  opcionesPagoCuota(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Param('idCuota', ParseIntPipe) idCuota: number,
  ) {
    return this.cobrosService.opcionesPagoCuota(idCondominio, idCuota);
  }

  /** Alias explicito para crear el cargo del metodo elegido. */
  @Post('cargo')
  crearCargo(@Req() req: AuthRequest, @Body() dto: CrearCargoMetodoDto) {
    return this.cobrosService.crearCargoPorMetodo(
      dto.idCondominio,
      dto.idCuota,
      dto.metodo,
      this.idMembresia(req, dto.idCondominio),
    );
  }

  /**
   * Crea el cobro con tarjeta y devuelve el `clientSecret` del checkout
   * embebido. Requiere que la cuenta Connect del condominio pueda cobrar.
   *
   * El cargo NO se marca pagado aqui: eso lo confirma el webhook de Connect
   * cuando Stripe reporta el pago. La respuesta del navegador no es confiable.
   */
  @Post('cargo/tarjeta')
  crearCargoTarjeta(@Req() req: AuthRequest, @Body() dto: CrearCargoDto) {
    return this.cobrosStripe.crearCobroTarjeta(
      dto.idCondominio,
      dto.idCuota,
      this.idMembresia(req, dto.idCondominio),
    );
  }

  /** Membresia del usuario autenticado en el condominio, o `null`. */
  private idMembresia(req: AuthRequest, idCondominio: number): number | null {
    const membresia = (req.user?.memberships ?? []).find(
      (item) => Number(item.idCondominio) === Number(idCondominio),
    );
    return membresia ? Number(membresia.idUsuarioCondominio) : null;
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
  crearCuentaConnect(
    @Req() req: AuthRequest,
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
  ) {
    return this.connectService.crearOReutilizarCuenta(
      idCondominio,
      this.idMembresia(req, idCondominio),
    );
  }

  /**
   * Administrador: enlace de onboarding hospedado por Stripe.
   *
   * **Respaldo.** El camino principal es `POST connect/sesion`, que monta el
   * onboarding dentro de Elyx. Este enlace se conserva para cuando el componente
   * embebido no pueda cargarse (red restringida, navegador sin soporte) y para
   * resolver requisitos que Stripe marque despues.
   */
  @Post('connect/enlace')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crearEnlaceConnect(
    @Req() req: AuthRequest,
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
  ) {
    return this.connectService.crearEnlaceOnboarding(
      idCondominio,
      this.idMembresia(req, idCondominio),
    );
  }

  /**
   * Administrador: sesion para montar el onboarding **dentro de Elyx**.
   *
   * Devuelve el `clientSecret` que consume `@stripe/connect-js`. El condominio
   * nunca sale de la aplicacion y no obtiene dashboard de Stripe (`none`).
   */
  @Post('connect/sesion')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crearSesionConnect(
    @Req() req: AuthRequest,
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
  ) {
    return this.connectService.crearSesionOnboarding(
      idCondominio,
      this.idMembresia(req, idCondominio),
    );
  }

  // ---------------------------------------------------------------------------
  // Administradores como propietarios de la cuenta
  // ---------------------------------------------------------------------------

  /**
   * Administrador: administradores activos y su Person en Stripe.
   *
   * La cuenta pertenece al condominio. Este listado dice quién ya está como
   * propietario y quién quedó pendiente, además de las Personas huérfanas
   * (administradores degradados o dados de baja).
   */
  @Get('connect/administradores')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  administradoresConnect(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.connectService.listarAdministradores(idCondominio);
  }

  /** Administrador: crea o adopta la Person de cada administrador activo. */
  @Post('connect/administradores/sincronizar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  sincronizarAdministradoresConnect(
    @Req() req: AuthRequest,
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
  ) {
    return this.connectService.sincronizarAdministradores(
      idCondominio,
      this.idMembresia(req, idCondominio),
    );
  }

  /**
   * Administrador: quita una Person de la cuenta.
   *
   * Se confirma explícitamente porque Stripe puede rechazarlo si es el último
   * representante: en ese caso el motivo se devuelve en lugar de un 500.
   */
  @Delete('connect/administradores/:idPersonaStripe')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  quitarAdministradorConnect(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Param('idPersonaStripe') idPersonaStripe: string,
  ) {
    return this.connectService.quitarAdministrador(idCondominio, idPersonaStripe);
  }

  // ---------------------------------------------------------------------------
  // Depositos (payouts de Stripe)
  // ---------------------------------------------------------------------------

  /**
   * Administrador: depositos que Stripe hizo al condominio.
   *
   * Con `dashboard: 'none'` este endpoint es la UNICA forma en que el
   * administrador ve cuanto y cuando le depositaron. Se alimenta del webhook de
   * Connect (`payout.*`) y de la reconciliacion diaria.
   */
  @Get('depositos')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  depositosDelCondominio(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.depositos.listar(idCondominio);
  }

  /**
   * Administrador: fuerza la reconciliacion contra Stripe.
   *
   * Sirve cuando el webhook no esta configurado con los eventos `payout.*` o
   * cuando el administrador acaba de ver el deposito en su banco y quiere que
   * aparezca ya, sin esperar al cron de las 6:15.
   */
  @Post('depositos/reconciliar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  reconciliarDepositos(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.depositos.reconciliar(idCondominio);
  }
}
