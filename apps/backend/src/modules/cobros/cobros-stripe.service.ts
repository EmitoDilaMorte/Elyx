import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Stripe from 'stripe';
import { PagosGateway } from '../pagos/pagos.gateway';
import { StripeClientService } from '../suscripciones/stripe-client.service';
import type { CargoRecord, DatosPagoCuota } from './cobros.types';

/**
 * Cobro de cuotas con tarjeta usando Stripe Connect (direct charges).
 *
 * **Modelo de dinero**: el cargo se crea SOBRE la cuenta conectada del
 * condominio (`{ stripeAccount: acct_... }`), asi que el dinero nunca pasa por
 * el balance de Elyx. Consecuencias:
 *  - La comision de Stripe se le debita al condominio, no a Elyx.
 *  - Un contracargo tambien se le debita al condominio.
 *  - Elyx no es intermediario de fondos de terceros.
 *
 * **Monto**: exactamente el de la cuota. No se agrega recargo ni comision al
 * condomino; si se hiciera, la cuota dejaria de valer lo que dice y habria que
 * explicar un cobro mayor en cada estado de cuenta.
 *
 * **MSI**: apagado por defecto. Con dynamic payment methods Stripe ofrece meses
 * sin intereses automaticamente para tarjetas de credito mexicanas, y cada
 * plazo agrega 5% o mas de comision que absorbe el condominio. Solo se habilita
 * si el administrador lo pidio explicitamente.
 */
@Injectable()
export class CobrosStripeService {
  private readonly logger = new Logger(CobrosStripeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeClient: StripeClientService,
    private readonly pagosGateway: PagosGateway,
  ) {}

  private get stripe(): Stripe | null {
    return this.stripeClient.cliente;
  }

  /**
   * Crea la Checkout Session de una cuota sobre la cuenta del condominio.
   *
   * Devuelve `clientSecret` para el checkout embebido. El cargo queda en
   * `PENDIENTE` hasta que llegue `checkout.session.completed` al webhook de
   * Connect: no se marca pagado con la respuesta del navegador, porque esa
   * respuesta la controla el cliente.
   *
   * Es idempotente por cuota: si ya hay un cargo con una sesion VIVA, devuelve
   * su `client_secret` en lugar de crear otra. Reabrir el modal del condomino
   * no debe dejar dos sesiones cobrables para la misma cuota.
   *
   * **Tarjeta guardada**: si se recibe la membresia que paga, se crea (o
   * reutiliza) su `Customer` EN LA CUENTA CONECTADA y la sesion se abre con el.
   * Asi el formulario muestra las tarjetas guardadas y ofrece guardar la nueva.
   * El guardado es `on_session`: nunca se crea un mandato para cobrar sin el
   * condomino presente.
   */
  async crearCobroTarjeta(
    idCondominio: number,
    idCuota: number,
    idUsuarioCondominio?: number | null,
  ): Promise<DatosPagoCuota> {
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException(
        'Stripe no esta configurado en esta instancia. Usa transferencia SPEI.',
      );
    }

    const configuracion = await this.configuracionCobro(idCondominio);
    if (!configuracion.stripeAccountId) {
      throw new BadRequestException(
        'El condominio aun no conecto su cuenta de Stripe. Configura el cobro con tarjeta o usa transferencia SPEI.',
      );
    }
    if (!configuracion.stripeChargesEnabled) {
      throw new BadRequestException(
        'La cuenta de Stripe del condominio aun no esta verificada. Usa transferencia SPEI.',
      );
    }

    const cuota = await this.cuotaParaCobro(idCondominio, idCuota);

    // Se consulta ANTES de crear la sesion: indica si el formulario mostrara
    // tarjetas guardadas de compras anteriores.
    const tarjetaGuardada = Boolean(
      await this.clienteGuardado(idCondominio, idUsuarioCondominio),
    );

    // Reutiliza el cargo vigente: regenerarlo cambiaria el monto o dejaria dos
    // sesiones vivas para la misma cuota.
    const vigente = await this.cargoVigente(idCuota);
    if (vigente?.metodo === 'STRIPE' && vigente.checkoutSessionId) {
      const existente = await this.recuperarClientSecret(stripe, vigente.checkoutSessionId, configuracion.stripeAccountId);
      if (existente) {
        return this.armarDatos(vigente, existente, configuracion, tarjetaGuardada, tarjetaGuardada);
      }
    }

    const base = this.baseUrl();
    const metadata = {
      idCondominio: String(idCondominio),
      idCuota: String(idCuota),
      // `idCargo` se llena tras insertar; se actualiza en el metadata de abajo.
      origen: 'CUOTA',
    };

    // El Customer vive EN LA CUENTA CONECTADA (direct charges). Si falla, el
    // cobro sigue sin tarjeta guardada: es una comodidad, no un requisito.
    const cliente = await this.asegurarCliente(
      idCondominio,
      idUsuarioCondominio,
      configuracion.stripeAccountId,
    );

    const sesion = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Embebido dentro de Elyx; `return_url` debe llevar el placeholder.
        // Se agrega `idCuota` para que el frontend pueda consultar el estado
        // del cargo al volver: la confirmacion llega por webhook, no por la
        // respuesta del navegador.
        ui_mode: 'embedded_page' as Stripe.Checkout.SessionCreateParams.UiMode,
        return_url: `${base}/pagos?checkout=ok&idCuota=${idCuota}&session_id={CHECKOUT_SESSION_ID}`,
        locale: 'es-419' as Stripe.Checkout.SessionCreateParams.Locale,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'mxn',
              // Monto exacto de la cuota. Sin recargos ni comisiones.
              unit_amount: Math.round(cuota.monto * 100),
              product_data: {
                name: `Cuota de mantenimiento ${cuota.periodo}`,
                description: `Unidad ${cuota.claveUnidad}`,
              },
            },
          },
        ],
        payment_method_options: {
          card: {
            // Apagado salvo que el administrador lo haya activado: MSI cuesta
            // 5%+ adicional y lo absorbe el condominio.
            installments: { enabled: configuracion.permitirMsi },
          },
        },
        // Con `customer` el formulario muestra las tarjetas guardadas y ofrece
        // guardar la nueva. Es la misma cuenta conectada la que guarda la
        // tarjeta, no la plataforma: por eso el id se creo con `stripeAccount`.
        ...(cliente
          ? {
              customer: cliente.customerId,
              saved_payment_method_options: {
                payment_method_save: 'enabled' as const,
              },
            }
          : {}),
        metadata,
        payment_intent_data: {
          metadata,
          // `on_session` guarda la tarjeta SIN crear un mandato de cobro
          // automatico: solo se puede usar cuando el condomino esta presente.
          // `off_session` permitiria cobrarle sin avisar, que no es lo que se
          // le promete al guardar la tarjeta.
          ...(cliente ? { setup_future_usage: 'on_session' as const } : {}),
        },
      },
      { stripeAccount: configuracion.stripeAccountId },
    );

    if (!sesion.client_secret) {
      throw new BadRequestException('Stripe no devolvio el secreto del checkout.');
    }

    // Si ya existe un cargo PENDIENTE para la cuota (por ejemplo, la sesion
    // anterior expiro) NO se puede insertar otro: el indice unico parcial lo
    // impide y el condomino se quedaria sin forma de pagar. Se reutiliza la
    // fila y se le cambia la sesion.
    const cargo = vigente
      ? await this.reemplazarSesionDeCargo(vigente.idCargo, cuota, sesion, configuracion.stripeAccountId)
      : await this.guardarCargo(idCondominio, cuota, sesion, configuracion.stripeAccountId);

    return this.armarDatos(cargo, sesion.client_secret, configuracion, tarjetaGuardada, Boolean(cliente));
  }

  /**
   * Confirma el cargo cuando llega `checkout.session.completed`.
   *
   * Es idempotente: si el cargo ya esta PAGADO, no hace nada. El condominio se
   * resuelve por `event.account` (la cuenta conectada que origino el evento),
   * NO por metadata: la metadata la controla el cliente y no debe decidir a
   * quien se le acredita un pago.
   */
  async confirmarCargoDesdeWebhook(
    session: Stripe.Checkout.Session,
    stripeAccountId: string,
  ): Promise<{ procesado: boolean; motivo?: string }> {
    // Se exige que el DINERO este, no que el flujo haya terminado.
    //
    // `status === 'complete'` solo dice que el cliente hizo su parte: con OXXO
    // o debito bancario la sesion queda `complete` con
    // `payment_status: 'unpaid'` hasta que el condomino paga en tienda. La
    // version anterior aceptaba esa combinacion y marcaba la cuota PAGADA sin
    // que hubiera entrado un peso. Ademas, como este metodo solo se invoca en
    // `checkout.session.completed`, `status` SIEMPRE es `complete` aqui: aquel
    // chequeo nunca se ejecutaba.
    //
    // `no_payment_required` es valido: es lo que devuelve Stripe cuando el
    // monto es cero o el cliente lo cubre con saldo.
    const liquidada =
      session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (!liquidada) {
      this.logger.log(
        `Sesion ${session.id} completada sin pago (payment_status=${session.payment_status}). ` +
          'Se espera el evento async_payment_succeeded.',
      );
      return { procesado: false, motivo: 'pago-no-confirmado' };
    }

    const idCargo = await this.idCargoDeSesion(session.id, stripeAccountId);
    if (!idCargo) {
      return { procesado: false, motivo: 'cargo-no-encontrado' };
    }

    const comision = await this.comisionReal(session, stripeAccountId);

    const actualizados = await this.dataSource.query(
      `
      UPDATE cargos_cuota
      SET estado = 'PAGADO',
          pagado_en = NOW(),
          stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
          stripe_balance_transaction_id = COALESCE($3, stripe_balance_transaction_id),
          monto_comision = $4,
          actualizado_en = NOW()
      WHERE id_cargo = $1 AND estado = 'PENDIENTE'
      RETURNING id_cargo, id_cuota, id_condominio, monto_total
      `,
      [idCargo, this.idPaymentIntent(session), comision?.balanceTransactionId ?? null, comision?.monto ?? 0],
    );

    const filas = this.filasDe(actualizados);
    if (filas.length === 0) {
      return { procesado: false, motivo: 'cargo-ya-confirmado' };
    }

    const cargo = filas[0];
    const idCuota = Number(cargo.id_cuota);
    const idCondominio = Number(cargo.id_condominio);
    const monto = Number(cargo.monto_total);

    await this.registrarPago(idCondominio, idCuota, idCargo, monto, session.id);

    // Avisa al navegador del condomino y del administrador. Sin esto la cuota
    // se marcaba pagada en la base pero la pantalla seguia mostrandola
    // pendiente hasta que alguien recargaba a mano.
    this.pagosGateway.emitPagoChanged(idCondominio, {
      tipo: 'VALIDADO',
      pago: { idCuota, idCargo, monto, origen: 'STRIPE' },
    });

    this.logger.log(
      `Cargo con tarjeta ${idCargo} confirmado (condominio ${idCondominio}, cuota ${idCuota}, comision $${(comision?.monto ?? 0).toFixed(2)}).`,
    );

    return { procesado: true };
  }

  /**
   * Libera el cargo de una sesion que no se cobro.
   *
   * Lo usan `checkout.session.expired` (el condomino abrio el formulario y no
   * pago a tiempo) y `checkout.session.async_payment_failed` (OXXO rechazado o
   * vencido). Sin liberarlo, el indice unico de cargos PENDIENTES impediria
   * generar uno nuevo y la cuota quedaria imposible de pagar en linea.
   */
  async liberarCargoPorSesion(
    sessionId: string,
    stripeAccountId: string,
    estado: 'EXPIRADO' | 'CANCELADO',
  ): Promise<boolean> {
    const actualizados = await this.dataSource.query(
      `
      UPDATE cargos_cuota
      SET estado = $3, actualizado_en = NOW()
      WHERE stripe_checkout_session_id = $1
        AND (stripe_account_id = $2 OR stripe_account_id IS NULL)
        AND estado = 'PENDIENTE'
      RETURNING id_cargo, id_cuota
      `,
      [sessionId, stripeAccountId, estado],
    );

    const filas = this.filasDe(actualizados);
    if (filas.length === 0) {
      return false;
    }

    this.logger.log(
      `Cargo ${filas[0].id_cargo} liberado como ${estado}: la sesion ${sessionId} no se cobro.`,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async configuracionCobro(idCondominio: number): Promise<{
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    permitirMsi: boolean;
  }> {
    const rows = await this.dataSource.query(
      `
      SELECT stripe_account_id, stripe_charges_enabled, permitir_msi
      FROM cuentas_cobro_condominio
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      return { stripeAccountId: null, stripeChargesEnabled: false, permitirMsi: false };
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      stripeAccountId: row.stripe_account_id ? String(row.stripe_account_id) : null,
      stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
      permitirMsi: Boolean(row.permitir_msi),
    };
  }

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

  private async cargoVigente(idCuota: number): Promise<{
    idCargo: number;
    idCuota: number;
    metodo: string;
    montoTotal: number;
    checkoutSessionId: string | null;
  } | null> {
    const rows = await this.dataSource.query(
      `
      SELECT id_cargo, id_cuota, metodo, monto_total, stripe_checkout_session_id
      FROM cargos_cuota
      WHERE id_cuota = $1 AND estado = 'PENDIENTE'
      LIMIT 1
      `,
      [idCuota],
    );

    if (rows.length === 0) {
      return null;
    }
    const row = rows[0] as Record<string, unknown>;
    return {
      idCargo: Number(row.id_cargo),
      idCuota: Number(row.id_cuota),
      metodo: String(row.metodo),
      montoTotal: Number(row.monto_total),
      checkoutSessionId: row.stripe_checkout_session_id
        ? String(row.stripe_checkout_session_id)
        : null,
    };
  }

  /**
   * Recupera el `client_secret` de una sesion ya creada.
   *
   * Stripe no lo devuelve al recuperar la sesion; hay que pedirlo en la sesion
   * y solo esta disponible mientras siga abierta. Si ya expiro, se devuelve
   * `null` y el llamador crea una nueva.
   */
  private async recuperarClientSecret(
    stripe: Stripe,
    sessionId: string,
    stripeAccountId: string,
  ): Promise<string | null> {
    try {
      const sesion = await stripe.checkout.sessions.retrieve(
        sessionId,
        {},
        { stripeAccount: stripeAccountId },
      );
      if (sesion.status !== 'open') {
        return null;
      }
      return sesion.client_secret ?? null;
    } catch {
      return null;
    }
  }

  private async guardarCargo(
    idCondominio: number,
    cuota: { idCuota: number; monto: number },
    sesion: Stripe.Checkout.Session,
    stripeAccountId: string,
  ): Promise<CargoRecord> {
    const expira = sesion.expires_at
      ? new Date(sesion.expires_at * 1000).toISOString()
      : null;

    const insertados = await this.dataSource.query(
      `
      INSERT INTO cargos_cuota (
        id_cuota, id_condominio, metodo, estado,
        monto_cuota, monto_comision, monto_total, moneda,
        stripe_checkout_session_id, stripe_account_id, expira_en
      )
      VALUES ($1, $2, 'STRIPE', 'PENDIENTE', $3, 0, $3, 'MXN', $4, $5, $6)
      ON CONFLICT (id_cuota) WHERE estado = 'PENDIENTE' DO NOTHING
      RETURNING id_cargo, id_cuota, id_condominio, metodo, estado, monto_cuota,
                monto_comision, monto_total, moneda, referencia_spei, expira_en, pagado_en
      `,
      [
        cuota.idCuota,
        idCondominio,
        cuota.monto,
        sesion.id,
        stripeAccountId,
        expira,
      ],
    );

    if (Array.isArray(insertados) && insertados.length > 0) {
      return this.toCargo(insertados[0] as Record<string, unknown>);
    }

    // Perdio la carrera contra otro proceso: se reutiliza el vigente.
    const vigente = await this.cargoVigente(cuota.idCuota);
    if (!vigente) {
      throw new BadRequestException('No fue posible registrar el cargo de la cuota.');
    }
    return {
      idCargo: vigente.idCargo,
      idCuota: vigente.idCuota,
      idCondominio,
      metodo: 'STRIPE',
      estado: 'PENDIENTE',
      montoCuota: vigente.montoTotal,
      montoComision: 0,
      montoTotal: vigente.montoTotal,
      moneda: 'MXN',
      referenciaSpei: null,
      expiraEn: null,
      pagadoEn: null,
    };
  }

  /**
   * Reutiliza el cargo PENDIENTE de la cuota apuntandolo a una sesion nueva.
   *
   * Sustituye a `guardarCargo` cuando ya existe una fila: el indice unico
   * parcial `uq_cargos_cuota_pendiente` solo permite un cargo vigente por
   * cuota, asi que insertar otro fallaria y el condomino no podria reintentar.
   *
   * Se limpia `referencia_spei` porque la referencia anterior ya no aplica, y
   * `metodo` pasa a STRIPE en caso de que el condominio haya cambiado de
   * SPEI a tarjeta.
   */
  private async reemplazarSesionDeCargo(
    idCargo: number,
    cuota: { idCuota: number; monto: number },
    sesion: Stripe.Checkout.Session,
    stripeAccountId: string,
  ): Promise<CargoRecord> {
    const expira = sesion.expires_at ? new Date(sesion.expires_at * 1000).toISOString() : null;

    const actualizados = await this.dataSource.query(
      `
      UPDATE cargos_cuota
      SET metodo = 'STRIPE',
          monto_cuota = $2,
          monto_total = $2,
          monto_comision = 0,
          stripe_checkout_session_id = $3,
          stripe_payment_intent_id = NULL,
          stripe_balance_transaction_id = NULL,
          stripe_account_id = $4,
          referencia_spei = NULL,
          expira_en = $5,
          actualizado_en = NOW()
      WHERE id_cargo = $1 AND estado = 'PENDIENTE'
      RETURNING id_cargo, id_cuota, id_condominio, metodo, estado, monto_cuota,
                monto_comision, monto_total, moneda, referencia_spei, expira_en, pagado_en
      `,
      [idCargo, cuota.monto, sesion.id, stripeAccountId, expira],
    );

    const filas = this.filasDe(actualizados);
    if (filas.length === 0) {
      throw new BadRequestException(
        'La cuota ya tiene un cobro en proceso. Cierra esta ventana y vuelve a intentarlo.',
      );
    }
    return this.toCargo(filas[0]);
  }

  private armarDatos(
    cargo: {
      idCargo: number;
      idCuota: number;
      montoTotal: number;
      moneda?: string;
      estado?: CargoRecord['estado'];
    },
    clientSecret: string,
    configuracion: { permitirMsi: boolean },
    tarjetaGuardada = false,
    guardarTarjeta = false,
  ): DatosPagoCuota {
    return {
      idCargo: cargo.idCargo,
      idCuota: cargo.idCuota,
      metodo: 'STRIPE',
      estado: cargo.estado ?? 'PENDIENTE',
      montoTotal: cargo.montoTotal,
      moneda: cargo.moneda ?? 'MXN',
      clientSecret,
      permitirMsi: configuracion.permitirMsi,
      tarjetaGuardada,
      guardarTarjeta,
    };
  }

  /**
   * Customer de Stripe de la membresia, si ya existe.
   *
   * Se mapea por (condominio, membresia) y NO por usuario: la misma persona en
   * dos condominios cobra contra dos cuentas conectadas distintas y por tanto
   * necesita dos Customers distintos.
   */
  private async clienteGuardado(
    idCondominio: number,
    idUsuarioCondominio?: number | null,
  ): Promise<string | null> {
    if (!idUsuarioCondominio || !Number.isInteger(idUsuarioCondominio)) {
      return null;
    }

    const rows = await this.dataSource.query(
      `
      SELECT stripe_customer_id
      FROM condominos_clientes_stripe
      WHERE id_condominio = $1 AND id_usuario_condominio = $2
      LIMIT 1
      `,
      [idCondominio, idUsuarioCondominio],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    const id = (rows[0] as Record<string, unknown>).stripe_customer_id;
    return id ? String(id) : null;
  }

  /**
   * Devuelve el Customer del condomino, creandolo si hace falta.
   *
   * **Vive en la cuenta conectada**, no en la plataforma: con direct charges el
   * cobro se crea sobre `acct_...` y un Customer de la plataforma no sirve para
   * guardar ni para volver a mostrar la tarjeta.
   *
   * Nunca lanza: guardar la tarjeta es una comodidad. Si Stripe falla, el cobro
   * se completa igual y el condomino solo vuelve a capturar la tarjeta.
   */
  private async asegurarCliente(
    idCondominio: number,
    idUsuarioCondominio: number | null | undefined,
    stripeAccountId: string,
  ): Promise<{ customerId: string; nuevo: boolean } | null> {
    const stripe = this.stripe;
    if (!stripe || !idUsuarioCondominio || !Number.isInteger(idUsuarioCondominio)) {
      return null;
    }

    const existente = await this.clienteGuardado(idCondominio, idUsuarioCondominio);
    if (existente) {
      // El id pudo quedar apuntando a la cuenta conectada ANTERIOR (el
      // condominio rehizo su cuenta de Stripe). En ese caso `retrieve` falla y
      // se descarta el mapeo en lugar de romper el cobro.
      try {
        const customer = await stripe.customers.retrieve(
          existente,
          {},
          { stripeAccount: stripeAccountId },
        );
        if (!(customer as Stripe.DeletedCustomer).deleted) {
          return { customerId: existente, nuevo: false };
        }
      } catch (error) {
        const codigo = (error as { code?: string }).code;
        if (codigo !== 'resource_missing') {
          // Error transitorio (red, limite de peticiones): NO se borra el
          // mapeo. Se usa el Customer guardado; si de verdad no existiera,
          // Stripe rechazaria la sesion y el error se ve en el cobro.
          this.logger.warn(
            `No se pudo verificar el Customer ${existente} del condominio ${idCondominio}: ` +
              `${(error as Error).message}`,
          );
          return { customerId: existente, nuevo: false };
        }

        this.logger.warn(
          `El Customer ${existente} del condominio ${idCondominio} no existe en ${stripeAccountId} ` +
            `(${(error as Error).message}). Se crea uno nuevo.`,
        );
      }

      await this.dataSource.query(
        `
        DELETE FROM condominos_clientes_stripe
        WHERE id_condominio = $1 AND id_usuario_condominio = $2 AND stripe_customer_id = $3
        `,
        [idCondominio, idUsuarioCondominio, existente],
      );
    }

    const datos = await this.datosFacturacionMembresia(idCondominio, idUsuarioCondominio);
    if (!datos) {
      // Sin membresia activa no hay persona a quien asociar el Customer.
      return null;
    }

    try {
      const customer = await stripe.customers.create(
        {
          ...(datos.correo ? { email: datos.correo } : {}),
          ...(datos.nombre ? { name: datos.nombre } : {}),
          metadata: {
            idCondominio: String(idCondominio),
            idUsuarioCondominio: String(idUsuarioCondominio),
          },
        },
        { stripeAccount: stripeAccountId },
      );

      const insertados = await this.dataSource.query(
        `
        INSERT INTO condominos_clientes_stripe (
          id_condominio, id_usuario_condominio, stripe_customer_id
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (id_condominio, id_usuario_condominio) DO NOTHING
        RETURNING stripe_customer_id
        `,
        [idCondominio, idUsuarioCondominio, customer.id],
      );

      if (this.filasDe(insertados).length > 0) {
        return { customerId: customer.id, nuevo: true };
      }

      // Perdio la carrera contra otra peticion: se usa el Customer ganador y se
      // borra el recien creado para no dejar Customers huerfanos en Stripe.
      await stripe.customers
        .del(customer.id, {}, { stripeAccount: stripeAccountId })
        .catch(() => undefined);
      const ganador = await this.clienteGuardado(idCondominio, idUsuarioCondominio);
      return ganador ? { customerId: ganador, nuevo: false } : null;
    } catch (error) {
      this.logger.warn(
        `No se pudo preparar el Customer de Stripe del condominio ${idCondominio}: ` +
          `${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Nombre y correo de la membresia, para prellenar el Customer. */
  private async datosFacturacionMembresia(
    idCondominio: number,
    idUsuarioCondominio: number,
  ): Promise<{ correo: string | null; nombre: string | null } | null> {
    const rows = await this.dataSource.query(
      `
      SELECT u.correo, u.nombre, u.primer_apellido, u.segundo_apellido
      FROM usuarios_condominios uc
      INNER JOIN usuarios u ON u.id_usuario = uc.id_usuario
      WHERE uc.id_usuario_condominio = $1
        AND uc.id_condominio = $2
        AND uc.estado = 'ACTIVO'
      LIMIT 1
      `,
      [idUsuarioCondominio, idCondominio],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0] as Record<string, unknown>;
    const nombre = [row.nombre, row.primer_apellido, row.segundo_apellido]
      .filter((parte) => Boolean(parte))
      .map((parte) => String(parte))
      .join(' ')
      .trim();

    return {
      correo: row.correo ? String(row.correo) : null,
      nombre: nombre.length > 0 ? nombre : null,
    };
  }

  private async idCargoDeSesion(
    sessionId: string,
    stripeAccountId: string,
  ): Promise<number | null> {
    const rows = await this.dataSource.query(
      `
      SELECT id_cargo
      FROM cargos_cuota
      WHERE stripe_checkout_session_id = $1
        AND (stripe_account_id = $2 OR stripe_account_id IS NULL)
      LIMIT 1
      `,
      [sessionId, stripeAccountId],
    );

    if (rows.length === 0) {
      return null;
    }
    return Number((rows[0] as Record<string, unknown>).id_cargo);
  }

  private idPaymentIntent(session: Stripe.Checkout.Session): string | null {
    return typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  }

  /**
   * Comision real que cobro Stripe, leida del `balance transaction`.
   *
   * No se calcula con la formula: la tasa varia por tarjeta internacional
   * (+0.5%) y por MSI (+5% o mas). El dato real es el unico que sirve para el
   * reporte financiero del administrador.
   */
  private async comisionReal(
    session: Stripe.Checkout.Session,
    stripeAccountId: string,
  ): Promise<{ monto: number; balanceTransactionId: string } | null> {
    const stripe = this.stripe;
    const paymentIntentId = this.idPaymentIntent(session);
    if (!stripe || !paymentIntentId) {
      return null;
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['latest_charge.balance_transaction'] },
        { stripeAccount: stripeAccountId },
      );

      const charge = intent.latest_charge;
      if (!charge || typeof charge === 'string') {
        return null;
      }

      const balance = charge.balance_transaction;
      if (!balance || typeof balance === 'string') {
        return null;
      }

      // `fee` viene en la unidad minima de la moneda (centavos).
      return {
        monto: Math.round(Number(balance.fee ?? 0)) / 100,
        balanceTransactionId: balance.id,
      };
    } catch (error) {
      // Sin el dato real se deja 0: es informativo, no bloquea el pago.
      this.logger.warn(
        `No fue posible leer la comision de ${paymentIntentId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Crea el pago VALIDADO y marca la cuota. Igual que la confirmacion SPEI. */
  private async registrarPago(
    idCondominio: number,
    idCuota: number,
    idCargo: number,
    monto: number,
    sessionId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const idUsuario = await this.idMembresiaAdmin(manager, idCondominio);

      await manager.query(
        `
        INSERT INTO pagos (
          monto, fecha_pago, estado, referencia, origen, id_cuota,
          id_usuario_condominio_paga, id_usuario_condominio_admin, id_cargo
        )
        VALUES ($1, NOW(), 'VALIDADO', $2, 'STRIPE', $3, NULL, $4, $5)
        ON CONFLICT (id_cuota) DO NOTHING
        `,
        [monto, sessionId, idCuota, idUsuario, idCargo],
      );

      await manager.query(
        `
        UPDATE cuotas
        SET estado = 'PAGADA', recargo_por_dia = 0
        WHERE id_cuota = $1
        `,
        [idCuota],
      );
    });
  }

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

  private toCargo(row: Record<string, unknown>): CargoRecord {
    return {
      idCargo: Number(row.id_cargo),
      idCuota: Number(row.id_cuota),
      idCondominio: Number(row.id_condominio),
      metodo: 'STRIPE',
      estado: String(row.estado) as CargoRecord['estado'],
      montoCuota: Number(row.monto_cuota),
      montoComision: Number(row.monto_comision ?? 0),
      montoTotal: Number(row.monto_total),
      moneda: String(row.moneda ?? 'MXN'),
      referenciaSpei: null,
      expiraEn: row.expira_en ? new Date(String(row.expira_en)).toISOString() : null,
      pagadoEn: row.pagado_en ? new Date(String(row.pagado_en)).toISOString() : null,
    };
  }
  private baseUrl(): string {
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .trim()
      .replace(/\/+$/, '');
    return base.length > 0 ? base : 'http://localhost:5173';
  }

  /**
   * Normaliza el resultado de un `RETURNING`.
   *
   * TypeORM puede devolver las filas directamente o envueltas en
   * `[filas, conteo]` segun el driver y la version. Sin normalizar, un
   * `UPDATE ... RETURNING` se lee como si la primera fila fuera un arreglo y
   * todos los campos salen `undefined` (que en Postgres termina en
   * "invalid input syntax for type integer: NaN").
   */
  private filasDe(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) {
      return [];
    }
    if (raw.length > 0 && Array.isArray(raw[0])) {
      return (raw[0] as Array<Record<string, unknown>>) ?? [];
    }
    return raw as Array<Record<string, unknown>>;
  }

  // ---------------------------------------------------------------------------
  // Utilidades del webhook
  // ---------------------------------------------------------------------------

  /**
   * Registra el evento para idempotencia.
   *
   * Reutiliza la tabla `stripe_eventos` del webhook de la suscripcion: el id de
   * evento de Stripe es unico globalmente, asi que la misma PK sirve aunque el
   * evento venga del scope de cuentas conectadas.
   *
   * `cuenta_conectada` se guarda para poder auditar de que condominio vino.
   */
  async registrarEventoStripe(evento: Stripe.Event, cuentaConectada: string | null): Promise<boolean> {
    const insertados = await this.dataSource.query(
      `
      INSERT INTO stripe_eventos (id_evento, tipo, payload, cuenta_conectada)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id_evento) DO NOTHING
      RETURNING id_evento
      `,
      [evento.id, evento.type, JSON.stringify(evento), cuentaConectada],
    );

    return Array.isArray(insertados) && insertados.length > 0;
  }

  /** Sincroniza `stripe_charges_enabled` tras un `account.updated`. */
  async sincronizarCapacidadCuenta(
    stripeAccountId: string,
    puedeCobrar: boolean,
  ): Promise<void> {
    const actualizados = await this.dataSource.query(
      `
      UPDATE cuentas_cobro_condominio
      SET stripe_charges_enabled = $2, actualizado_en = NOW()
      WHERE stripe_account_id = $1 AND stripe_charges_enabled IS DISTINCT FROM $2
      RETURNING id_condominio
      `,
      [stripeAccountId, puedeCobrar],
    );

    if (Array.isArray(actualizados) && actualizados.length > 0) {
      this.logger.log(
        `Cuenta ${stripeAccountId} ahora ${puedeCobrar ? 'puede' : 'no puede'} cobrar ` +
          `(condominio ${(actualizados[0] as Record<string, unknown>).id_condominio}).`,
      );
    }
  }
}
