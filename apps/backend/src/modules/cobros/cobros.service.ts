import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CuotasService } from '../cuotas/cuotas.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PagosGateway } from '../pagos/pagos.gateway';
import { esClabeValida, MENSAJE_CLABE_INVALIDA } from './clabe';
import { CobrosStripeService } from './cobros-stripe.service';
import { ActualizarConfiguracionCobroDto, ConfirmarCargoSpeiDto } from './dto/cobros.dto';
import type {
  CargoPendiente,
  CargoRecord,
  ConfiguracionCobro,
  DatosPagoCuota,
  EstadoCargo,
  MetodoCargo,
  MetodoCobro,
} from './cobros.types';

/** Dias de vigencia de un cargo SPEI antes de marcarlo EXPIRADO. */
const DIAS_VIGENCIA_SPEI = 15;

/**
 * Cobro de cuotas del condominio.
 *
 * Dos caminos con la misma interfaz:
 *  - `SPEI`: el condomino transfiere a la CLABE del condominio con una
 *    referencia. El administrador concilia y marca el cargo como pagado.
 *  - `STRIPE`: direct charge sobre la cuenta conectada del condominio. El
 *    dinero nunca pasa por Elyx (ver `CobrosStripeService`).
 *
 * Reglas de dinero:
 *  - `monto_total` SIEMPRE es igual al monto de la cuota. La cuota no se
 *    incrementa y el condomino no paga la comision.
 *  - La comision de Stripe la absorbe el condominio; `monto_comision` es
 *    informativo y se llena con el dato real de Stripe al confirmar.
 *  - Elyx no cobra comision por transaccion.
 */
@Injectable()
export class CobrosService {
  private readonly logger = new Logger(CobrosService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cuotasService: CuotasService,
    private readonly notificaciones: NotificacionesService,
    private readonly cobrosStripe: CobrosStripeService,
    private readonly pagosGateway: PagosGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Configuracion
  // ---------------------------------------------------------------------------

  /** Configuracion de cobro. Si el condominio nunca la definio, devuelve una vacia. */
  async obtenerConfiguracion(idCondominio: number): Promise<ConfiguracionCobro> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_condominio,
        c.rfc,
        cc.id_cuenta_cobro,
        cc.metodo,
        cc.clabe,
        cc.banco,
        cc.beneficiario,
        cc.referencia_prefijo,
        cc.stripe_account_id,
        cc.stripe_charges_enabled,
        cc.stripe_conectado_en,
        cc.permitir_msi,
        cc.comision_tasa,
        cc.comision_fijo,
        cc.activo
      FROM condominios c
      LEFT JOIN cuentas_cobro_condominio cc ON cc.id_condominio = c.id_condominio
      WHERE c.id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    const tieneRfc = Boolean(String(row.rfc ?? '').trim());
    const clabe = row.clabe ? String(row.clabe) : null;

    return {
      idCondominio: Number(row.id_condominio),
      metodo: (String(row.metodo ?? 'NINGUNO') as MetodoCobro) ?? 'NINGUNO',
      clabe,
      banco: row.banco ? String(row.banco) : null,
      beneficiario: row.beneficiario ? String(row.beneficiario) : null,
      referenciaPrefijo: row.referencia_prefijo ? String(row.referencia_prefijo) : null,
      stripeAccountId: row.stripe_account_id ? String(row.stripe_account_id) : null,
      stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
      stripeConectadoEn: row.stripe_conectado_en
        ? new Date(String(row.stripe_conectado_en)).toISOString()
        : null,
      permitirMsi: Boolean(row.permitir_msi),
      comisionTasa: Number(row.comision_tasa ?? 3.6),
      comisionFijo: Number(row.comision_fijo ?? 3),
      activo: row.id_cuenta_cobro ? Boolean(row.activo) : false,
      puedeUsarConnect: tieneRfc,
      motivoNoConnect: tieneRfc
        ? null
        : 'Para cobrar con tarjeta necesitas registrar el RFC del condominio: Stripe lo exige ' +
          'para verificar la cuenta y poder depositarle. Si aun no lo tienes, usa transferencia ' +
          'SPEI, que solo requiere una CLABE.',
      puedeUsarSpei: Boolean(clabe),
    };
  }

  /**
   * Actualiza la configuracion.
   *
   * El bloqueo por RFC es deliberado y ocurre ANTES de llamar a Stripe: si el
   * condominio no tiene RFC, la cuenta conectada no podria verificarse y el
   * dinero no tendria a donde llegar. Es preferible explicarlo aqui que dejar
   * que Stripe rechace con un error opaco meses despues.
   */
  async actualizarConfiguracion(
    idCondominio: number,
    dto: ActualizarConfiguracionCobroDto,
  ): Promise<ConfiguracionCobro> {
    if (dto.metodo === 'STRIPE_CONNECT') {
      const rfcRows = await this.dataSource.query(
        `SELECT rfc FROM condominios WHERE id_condominio = $1 LIMIT 1`,
        [idCondominio],
      );
      if (rfcRows.length === 0) {
        throw new NotFoundException('No se encontro el condominio indicado.');
      }
      const rfc = String((rfcRows[0] as Record<string, unknown>).rfc ?? '').trim();
      if (!rfc) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'RFC_REQUERIDO_PARA_CONNECT',
          message:
            'Para cobrar con tarjeta necesitas registrar el RFC del condominio: Stripe lo exige ' +
            'para verificar la cuenta y poder depositarle. Si aun no lo tienes, usa transferencia ' +
            'SPEI, que solo requiere una CLABE.',
        });
      }
    }

    if (dto.metodo === 'SPEI') {
      const clabe = dto.clabe ?? (await this.clabeActual(idCondominio));
      if (!clabe) {
        throw new BadRequestException(
          'Captura la CLABE del condominio antes de activar la transferencia SPEI.',
        );
      }
    }

    if (dto.clabe !== undefined && !esClabeValida(dto.clabe)) {
      throw new BadRequestException(MENSAJE_CLABE_INVALIDA);
    }

    const prefijo = dto.referenciaPrefijo?.trim().toUpperCase() || null;

    await this.dataSource.query(
      `
      INSERT INTO cuentas_cobro_condominio (
        id_condominio, metodo, clabe, banco, beneficiario, referencia_prefijo,
        permitir_msi, comision_tasa, comision_fijo
      )
      VALUES ($1, COALESCE($2, 'NINGUNO'), $3, $4, $5, COALESCE($6, $7), COALESCE($8, FALSE), COALESCE($9, 3.60), COALESCE($10, 3.00))
      ON CONFLICT (id_condominio) DO UPDATE SET
        metodo = COALESCE($2, cuentas_cobro_condominio.metodo),
        clabe = COALESCE($3, cuentas_cobro_condominio.clabe),
        banco = COALESCE($4, cuentas_cobro_condominio.banco),
        beneficiario = COALESCE($5, cuentas_cobro_condominio.beneficiario),
        referencia_prefijo = COALESCE($6, cuentas_cobro_condominio.referencia_prefijo),
        permitir_msi = COALESCE($8, cuentas_cobro_condominio.permitir_msi),
        comision_tasa = COALESCE($9, cuentas_cobro_condominio.comision_tasa),
        comision_fijo = COALESCE($10, cuentas_cobro_condominio.comision_fijo),
        actualizado_en = NOW()
      `,
      [
        idCondominio,
        dto.metodo ?? null,
        dto.clabe ?? null,
        dto.banco?.trim() || null,
        dto.beneficiario?.trim() || null,
        prefijo,
        await this.prefijoPorDefecto(idCondominio, prefijo),
        dto.permitirMsi ?? null,
        dto.comisionTasa ?? null,
        dto.comisionFijo ?? null,
      ],
    );

    this.logger.log(`Configuracion de cobro actualizada (condominio ${idCondominio}).`);
    return this.obtenerConfiguracion(idCondominio);
  }

  private async clabeActual(idCondominio: number): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT clabe FROM cuentas_cobro_condominio WHERE id_condominio = $1 LIMIT 1`,
      [idCondominio],
    );
    const clabe = rows.length > 0 ? (rows[0] as Record<string, unknown>).clabe : null;
    return clabe ? String(clabe) : null;
  }

  /** Prefijo legible derivado del nombre: "Jardines de la Sierra" -> "JAR". */
  private async prefijoPorDefecto(
    idCondominio: number,
    prefijo: string | null,
  ): Promise<string | null> {
    if (prefijo) {
      return prefijo;
    }

    const rows = await this.dataSource.query(
      `SELECT nombre FROM condominios WHERE id_condominio = $1 LIMIT 1`,
      [idCondominio],
    );
    const nombre = rows.length > 0 ? String((rows[0] as Record<string, unknown>).nombre ?? '') : '';
    const palabras = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^A-Za-z0-9]+/)
      .filter((p) => p.length >= 2);

    if (palabras.length === 0) {
      return `CON${idCondominio}`;
    }
    if (palabras.length === 1) {
      return palabras[0].slice(0, 3).toUpperCase();
    }
    return palabras
      .slice(0, 3)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Cargos
  // ---------------------------------------------------------------------------

  /** Cargo vigente de una cuota, o `null` si no hay. */
  async cargoVigente(idCuota: number): Promise<CargoRecord | null> {
    const rows = await this.dataSource.query(
      `
      SELECT id_cargo, id_cuota, id_condominio, metodo, estado, monto_cuota,
             monto_comision, monto_total, moneda, referencia_spei, expira_en, pagado_en
      FROM cargos_cuota
      WHERE id_cuota = $1 AND estado = 'PENDIENTE'
      LIMIT 1
      `,
      [idCuota],
    );

    return rows.length > 0 ? this.toCargo(rows[0] as Record<string, unknown>) : null;
  }

  /**
   * Cargos SPEI pendientes de conciliar.
   *
   * El administrador los ve junto a la configuracion de cobro para poder
   * marcarlos pagados cuando aparecen en su estado de cuenta. Solo se listan
   * los SPEI: los cargos con tarjeta los confirma Stripe por webhook y no
   * requieren accion manual.
   */
  async cargosPendientesSpei(idCondominio: number): Promise<CargoPendiente[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        cc.id_cargo,
        cc.id_cuota,
        cc.monto_total,
        cc.referencia_spei,
        cc.expira_en,
        c.periodo,
        u.clave_unidad
      FROM cargos_cuota cc
      INNER JOIN cuotas c ON c.id_cuota = cc.id_cuota
      INNER JOIN unidades u ON u.id_unidad = c.id_unidad
      WHERE cc.id_condominio = $1
        AND cc.estado = 'PENDIENTE'
        AND cc.metodo = 'SPEI'
      ORDER BY cc.expira_en ASC NULLS LAST, cc.id_cargo ASC
      `,
      [idCondominio],
    );

    if (!Array.isArray(rows)) {
      return [];
    }

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      idCargo: Number(row.id_cargo),
      idCuota: Number(row.id_cuota),
      periodo: String(row.periodo),
      claveUnidad: String(row.clave_unidad),
      montoTotal: Number(row.monto_total),
      referenciaSpei: row.referencia_spei ? String(row.referencia_spei) : null,
      expiraEn: row.expira_en ? new Date(String(row.expira_en)).toISOString() : null,
    }));
  }

  /**
   * Estado de una cuota frente a su cargo en linea.
   *
   * Lo usa el frontend al volver del checkout de Stripe: la confirmacion llega
   * por webhook, no por la respuesta del navegador, asi que se consulta hasta
   * que la cuota queda pagada.
   */
  async estadoCargoCuota(
    idCondominio: number,
    idCuota: number,
  ): Promise<{
    idCuota: number;
    estadoCuota: string;
    idCargo: number | null;
    estadoCargo: EstadoCargo | null;
    pagadoEn: string | null;
  }> {
    const cuotas = await this.dataSource.query(
      `
      SELECT id_cuota, estado
      FROM cuotas
      WHERE id_cuota = $1 AND id_condominio = $2
      LIMIT 1
      `,
      [idCuota, idCondominio],
    );

    if (cuotas.length === 0) {
      throw new NotFoundException('No se encontro la cuota para el condominio indicado.');
    }

    const cuota = cuotas[0] as Record<string, unknown>;
    const cargos = await this.dataSource.query(
      `
      SELECT id_cargo, estado, pagado_en
      FROM cargos_cuota
      WHERE id_cuota = $1
      ORDER BY
        CASE WHEN estado = 'PENDIENTE' THEN 0 ELSE 1 END,
        id_cargo DESC
      LIMIT 1
      `,
      [idCuota],
    );

    const cargo =
      Array.isArray(cargos) && cargos.length > 0
        ? (cargos[0] as Record<string, unknown>)
        : null;

    return {
      idCuota: Number(cuota.id_cuota),
      estadoCuota: String(cuota.estado),
      idCargo: cargo ? Number(cargo.id_cargo) : null,
      estadoCargo: cargo ? (String(cargo.estado) as EstadoCargo) : null,
      pagadoEn: cargo?.pagado_en ? new Date(String(cargo.pagado_en)).toISOString() : null,
    };
  }

  /**
   * Datos para que el condomino pague una cuota.
   *
   * Si ya hay un cargo vigente lo reutiliza: regenerarlo en cada visita haria
   * que el condomino viera una referencia distinta cada vez y pagara dos veces.
   */
  async datosPagoCuota(idCondominio: number, idCuota: number): Promise<DatosPagoCuota> {
    const cuota = await this.cuotaParaCobro(idCondominio, idCuota);

    const existente = await this.cargoVigente(idCuota);
    if (existente && existente.estado === 'PENDIENTE') {
      // Un cargo con tarjeta necesita su `clientSecret` para montar el
      // checkout. Devolver los datos "planos" dejaba el modal VACIO al
      // reabrirlo, porque el cargo sigue PENDIENTE mientras la sesion de
      // Stripe este viva. `crearCobroTarjeta` reutiliza la sesion existente
      // (o crea otra) y siempre devuelve el secreto.
      if (existente.metodo === 'STRIPE') {
        return this.cobrosStripe.crearCobroTarjeta(idCondominio, idCuota);
      }
      return this.armarDatosPago(existente, idCondominio);
    }

    const configuracion = await this.obtenerConfiguracion(idCondominio);
    if (configuracion.metodo === 'NINGUNO') {
      return {
        idCargo: 0,
        idCuota,
        metodo: 'SPEI',
        estado: 'PENDIENTE',
        montoTotal: cuota.monto,
        moneda: 'MXN',
        motivo:
          'El condominio aun no configuro como cobrar en linea. Sube tu comprobante o contacta al administrador.',
      };
    }

    if (configuracion.metodo === 'STRIPE_CONNECT') {
      // El cobro con tarjeta lo crea `CobrosStripeService`: aqui se delega para
      // que el condomino reciba el `clientSecret` del checkout embebido.
      if (!configuracion.stripeChargesEnabled) {
        return {
          idCargo: 0,
          idCuota,
          metodo: 'STRIPE',
          estado: 'PENDIENTE',
          montoTotal: cuota.monto,
          moneda: 'MXN',
          motivo:
            'La cuenta de Stripe del condominio aun no esta verificada. Usa transferencia SPEI.',
        };
      }

      return this.cobrosStripe.crearCobroTarjeta(idCondominio, idCuota);
    }

    const cargo = await this.crearCargoSpei(idCondominio, cuota, configuracion);
    return this.armarDatosPago(cargo, idCondominio);
  }

  /** Datos de la cuota que se va a cobrar, validando que sea cobrable. */
  private async cuotaParaCobro(
    idCondominio: number,
    idCuota: number,
  ): Promise<{ idCuota: number; monto: number; periodo: string; claveUnidad: string }> {
    const rows = await this.dataSource.query(
      `
      SELECT c.id_cuota, c.monto_base, c.periodo, c.estado, u.clave_unidad
      FROM cuotas c
      INNER JOIN unidades u ON u.id_unidad = c.id_unidad
      WHERE c.id_cuota = $1 AND c.id_condominio = $2
      LIMIT 1
      `,
      [idCuota, idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la cuota para el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    if (String(row.estado) === 'PAGADA') {
      throw new BadRequestException('Esta cuota ya esta pagada.');
    }

    return {
      idCuota: Number(row.id_cuota),
      monto: Number(row.monto_base),
      periodo: String(row.periodo),
      claveUnidad: String(row.clave_unidad),
    };
  }

  /**
   * Crea el cargo SPEI con su referencia.
   *
   * La referencia se arma con datos que el administrador reconoce en su estado
   * de cuenta: prefijo del condominio, periodo y unidad. Asi la conciliacion no
   * depende de buscar un id interno.
   */
  private async crearCargoSpei(
    idCondominio: number,
    cuota: { idCuota: number; monto: number; periodo: string; claveUnidad: string },
    configuracion: ConfiguracionCobro,
  ): Promise<CargoRecord> {
    if (!configuracion.clabe) {
      throw new BadRequestException(
        'El condominio aun no capturo su CLABE. Contacta al administrador.',
      );
    }

    const prefijo = configuracion.referenciaPrefijo ?? `CON${idCondominio}`;
    const referencia = this.construirReferencia(prefijo, cuota.periodo, cuota.claveUnidad);
    const expira = new Date(Date.now() + DIAS_VIGENCIA_SPEI * 24 * 60 * 60 * 1000);

    // `ON CONFLICT` sobre el indice parcial: si dos peticiones simultaneas
    // intentan crear el cargo, solo una gana y la otra reutiliza el vigente.
    const insertados = await this.dataSource.query(
      `
      INSERT INTO cargos_cuota (
        id_cuota, id_condominio, metodo, estado,
        monto_cuota, monto_comision, monto_total, moneda,
        referencia_spei, expira_en
      )
      VALUES ($1, $2, 'SPEI', 'PENDIENTE', $3, 0, $3, 'MXN', $4, $5)
      ON CONFLICT (id_cuota) WHERE estado = 'PENDIENTE' DO NOTHING
      RETURNING id_cargo, id_cuota, id_condominio, metodo, estado, monto_cuota,
                monto_comision, monto_total, moneda, referencia_spei, expira_en, pagado_en
      `,
      [cuota.idCuota, idCondominio, cuota.monto, referencia, expira.toISOString()],
    );

    if (Array.isArray(insertados) && insertados.length > 0) {
      return this.toCargo(insertados[0] as Record<string, unknown>);
    }

    // Perdio la carrera: otro proceso ya creo el cargo.
    const vigente = await this.cargoVigente(cuota.idCuota);
    if (!vigente) {
      throw new BadRequestException('No fue posible crear el cargo de la cuota.');
    }
    return vigente;
  }

  /** `<prefijo>-<periodo>-<unidad>`, en mayusculas y sin caracteres raros. */
  private construirReferencia(prefijo: string, periodo: string, claveUnidad: string): string {
    const limpiar = (valor: string) =>
      valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase();

    return [limpiar(prefijo), limpiar(periodo), limpiar(claveUnidad)]
      .filter((parte) => parte.length > 0)
      .join('-')
      .slice(0, 60);
  }

  private async armarDatosPago(
    cargo: CargoRecord,
    idCondominio: number,
  ): Promise<DatosPagoCuota> {
    const configuracion = await this.obtenerConfiguracion(idCondominio);

    return {
      idCargo: cargo.idCargo,
      idCuota: cargo.idCuota,
      metodo: cargo.metodo,
      estado: cargo.estado,
      montoTotal: cargo.montoTotal,
      moneda: cargo.moneda,
      clabe: configuracion.clabe,
      banco: configuracion.banco,
      beneficiario: configuracion.beneficiario,
      referencia: cargo.referenciaSpei,
      clientSecret: null,
    };
  }

  /**
   * Conciliacion manual de un cargo SPEI.
   *
   * Crea el pago (origen SPEI, ya VALIDADO: el administrador lo esta
   * confirmando) y delega en `CuotasService` el cambio de estado de la cuota,
   * para que el flujo sea identico al de aprobar un comprobante.
   */
  async confirmarCargoSpei(input: ConfirmarCargoSpeiDto): Promise<CargoRecord> {
    const cargo = await this.dataSource.transaction(async (manager) => {
      const rowsRaw = await manager.query(
        `
        SELECT id_cargo, id_cuota, id_condominio, metodo, estado, monto_cuota,
               monto_comision, monto_total, moneda, referencia_spei, expira_en, pagado_en
        FROM cargos_cuota
        WHERE id_cargo = $1 AND id_condominio = $2
        LIMIT 1
        FOR UPDATE
        `,
        [input.idCargo, input.idCondominio],
      );

      const rows = Array.isArray(rowsRaw) ? (rowsRaw as Array<Record<string, unknown>>) : [];
      if (rows.length === 0) {
        throw new NotFoundException('No se encontro el cargo indicado.');
      }

      const actual = this.toCargo(rows[0]);
      if (actual.estado !== 'PENDIENTE') {
        throw new BadRequestException('Solo se pueden confirmar cargos pendientes.');
      }
      if (actual.metodo !== 'SPEI') {
        throw new BadRequestException(
          'Este cargo es de tarjeta: lo confirma Stripe automaticamente, no el administrador.',
        );
      }

      const actualizadosRaw = await manager.query(
        `
        UPDATE cargos_cuota
        SET estado = 'PAGADO', pagado_en = NOW(), actualizado_en = NOW()
        WHERE id_cargo = $1 AND estado = 'PENDIENTE'
        RETURNING id_cargo, id_cuota, id_condominio, metodo, estado, monto_cuota,
                  monto_comision, monto_total, moneda, referencia_spei, expira_en, pagado_en
        `,
        [input.idCargo],
      );

      const actualizados = Array.isArray(actualizadosRaw)
        ? (actualizadosRaw as Array<Record<string, unknown>>)
        : [];
      if (actualizados.length === 0) {
        throw new BadRequestException('El cargo ya fue confirmado por otro proceso.');
      }

      // Pago VALIDADO directo: el administrador esta afirmando que el dinero
      // llego. No pasa por CAPTURADO porque no hay comprobante que revisar.
      const idUsuario = await this.idMembresiaAdmin(manager, input.idCondominio);
      await manager.query(
        `
        INSERT INTO pagos (
          monto, fecha_pago, estado, referencia, origen, id_cuota,
          id_usuario_condominio_paga, id_usuario_condominio_admin, id_cargo
        )
        VALUES ($1, NOW(), 'VALIDADO', $2, 'SPEI', $3, NULL, $4, $5)
        ON CONFLICT (id_cuota) DO NOTHING
        `,
        [
          actual.montoTotal,
          input.referenciaBancaria?.trim() || actual.referenciaSpei,
          actual.idCuota,
          idUsuario,
          actual.idCargo,
        ],
      );

      await this.cuotasService.marcarPagadaEnTransaccion(manager, actual.idCuota);

      return { ...actual, estado: 'PAGADO' as EstadoCargo, pagadoEn: new Date().toISOString() };
    });

    await this.notificarPagoConfirmado(input.idCondominio, cargo);

    // Refresca la lista de cuotas del condomino y del administrador sin que
    // tengan que recargar la pagina.
    this.pagosGateway.emitPagoChanged(input.idCondominio, {
      tipo: 'VALIDADO',
      pago: {
        idCuota: cargo.idCuota,
        idCargo: cargo.idCargo,
        monto: cargo.montoTotal,
        origen: 'SPEI',
      },
    });

    this.logger.log(
      `Cargo SPEI ${cargo.idCargo} confirmado (condominio ${input.idCondominio}, cuota ${cargo.idCuota}).`,
    );

    return cargo;
  }

  /**
   * Cancela el cargo vigente de una cuota.
   *
   * Se usa cuando el administrador aprueba un comprobante: si el cargo siguiera
   * PENDIENTE, el condomino podria pagar dos veces la misma cuota.
   */
  async cancelarCargoVigente(idCuota: number, motivo: string): Promise<number> {
    const rows = await this.dataSource.query(
      `
      UPDATE cargos_cuota
      SET estado = 'CANCELADO', actualizado_en = NOW()
      WHERE id_cuota = $1 AND estado = 'PENDIENTE'
      RETURNING id_cargo
      `,
      [idCuota],
    );

    const total = Array.isArray(rows) ? rows.length : 0;
    if (total > 0) {
      this.logger.log(`Cargo vigente cancelado en la cuota ${idCuota}: ${motivo}`);
    }
    return total;
  }

  /** Marca EXPIRADOS los cargos SPEI vencidos. Se ejecuta cada hora. */
  @Cron(CronExpression.EVERY_HOUR)
  async expirarCargosVencidos(): Promise<number> {
    const rows = await this.dataSource.query(
      `
      UPDATE cargos_cuota
      SET estado = 'EXPIRADO', actualizado_en = NOW()
      WHERE estado = 'PENDIENTE'
        AND metodo = 'SPEI'
        AND expira_en IS NOT NULL
        AND expira_en < NOW()
      RETURNING id_cargo
      `,
    );

    const total = Array.isArray(rows) ? rows.length : 0;
    if (total > 0) {
      this.logger.log(`Cargos SPEI expirados: ${total}`);
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async idMembresiaAdmin(
    manager: { query: (q: string, p?: unknown[]) => Promise<unknown> },
    idCondominio: number,
  ): Promise<number | null> {
    const rowsRaw = await manager.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
      ORDER BY id_usuario_condominio
      LIMIT 1
      `,
      [idCondominio],
    );

    const rows = Array.isArray(rowsRaw) ? (rowsRaw as Array<Record<string, unknown>>) : [];
    return rows.length > 0 ? Number(rows[0].id_usuario_condominio) : null;
  }

  private async notificarPagoConfirmado(
    idCondominio: number,
    cargo: CargoRecord,
  ): Promise<void> {
    try {
      const rows = await this.dataSource.query(
        `
        SELECT uc.id_usuario_condominio, u.clave_unidad
        FROM cuotas c
        INNER JOIN unidades u ON u.id_unidad = c.id_unidad
        LEFT JOIN unidades_ocupantes uo ON uo.id_unidad = u.id_unidad
          AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
        LEFT JOIN usuarios_condominios uc ON uc.id_usuario_condominio = uo.id_usuario_condominio
        WHERE c.id_cuota = $1
        LIMIT 1
        `,
        [cargo.idCuota],
      );

      const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
      const idUsuarioCondominio = row?.id_usuario_condominio
        ? Number(row.id_usuario_condominio)
        : null;

      if (!idUsuarioCondominio) {
        return;
      }

      await this.notificaciones.create({
        idCondominio,
        idUsuarioCondominio,
        tipo: 'PAGO_EN_LINEA_CONFIRMADO',
        canal: 'INTERNA',
        asunto: 'Pago confirmado',
        mensaje: `Tu pago de $${cargo.montoTotal.toFixed(2)} fue confirmado. Referencia ${cargo.referenciaSpei ?? cargo.idCargo}.`,
        fechaProgramada: new Date().toISOString(),
      });
    } catch (error) {
      // La notificacion nunca debe tumbar la confirmacion del pago.
      this.logger.warn(
        `No fue posible notificar el pago del cargo ${cargo.idCargo}: ${(error as Error).message}`,
      );
    }
  }

  private toCargo(row: Record<string, unknown>): CargoRecord {
    return {
      idCargo: Number(row.id_cargo),
      idCuota: Number(row.id_cuota),
      idCondominio: Number(row.id_condominio),
      metodo: String(row.metodo) as MetodoCargo,
      estado: String(row.estado) as EstadoCargo,
      montoCuota: Number(row.monto_cuota),
      montoComision: Number(row.monto_comision ?? 0),
      montoTotal: Number(row.monto_total),
      moneda: String(row.moneda ?? 'MXN'),
      referenciaSpei: row.referencia_spei ? String(row.referencia_spei) : null,
      expiraEn: row.expira_en ? new Date(String(row.expira_en)).toISOString() : null,
      pagadoEn: row.pagado_en ? new Date(String(row.pagado_en)).toISOString() : null,
    };
  }
}