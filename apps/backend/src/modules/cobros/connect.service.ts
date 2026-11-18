import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Stripe from 'stripe';
import { StripeClientService } from '../suscripciones/stripe-client.service';

/**
 * MCC de "Asociaciones: otras asociaciones".
 *
 * Accounts v2 no tiene un campo `industry`: el selector de industria del
 * onboarding solo sirve para que Stripe derive el Merchant Category Code. Al
 * fijarlo aquí, el administrador ya no tiene que elegir el sector a mano.
 * Stripe puede revisarlo y sobrescribirlo si no cuadra con el negocio.
 */
const MCC_ASOCIACIONES = '8699';

/**
 * Cuenta conectada v2 tal como la ve el administrador.
 *
 * No se expone el objeto crudo de Stripe: solo lo que la UI necesita para
 * decidir si puede cobrar y que le falta.
 */
export type EstadoCuentaConnect = {
  tieneCuenta: boolean;
  stripeAccountId: string | null;
  /** `active` = puede cobrar. `restricted`/`pending` = falta informacion. */
  estadoCapacidad: 'active' | 'restricted' | 'pending' | 'unknown' | 'sin-cuenta';
  puedeCobrar: boolean;
  /** Requisitos que Stripe pide y aun no se cumplen. */
  requisitosPendientes: string[];
  /** Mensaje accionable cuando no puede cobrar. */
  motivo: string | null;
  /** `true` si la cuenta existe y solo falta completar el onboarding. */
  puedeContinuarOnboarding: boolean;
  conectadoEn: string | null;
  dashboard: string | null;
};

/** Administrador activo y su Person en la cuenta conectada (si existe). */
export type AdministradorStripe = {
  idUsuarioCondominio: number;
  nombre: string;
  correo: string;
  stripePersonId: string | null;
  /** Marcado como propietario de la cuenta en Stripe. */
  propietario: boolean;
  representante: boolean;
};

/** Persona de Stripe que ya no corresponde a un administrador activo. */
export type PersonaHuerfanaStripe = {
  stripePersonId: string;
  nombre: string;
  correo: string | null;
  motivo: 'inactivo' | 'condomino' | 'inexistente';
};

export type EstadoAdministradoresStripe = {
  tieneCuenta: boolean;
  stripeAccountId: string | null;
  administradores: AdministradorStripe[];
  huerfanos: PersonaHuerfanaStripe[];
  advertencias: string[];
};

/** Persona de Stripe tal como la necesita este servicio. */
type PersonaStripe = {
  id: string;
  given_name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  relationship?: { representative?: boolean; owner?: boolean } | null;
  metadata?: Record<string, string> | null;
};

type MiembroCondominio = {
  idUsuarioCondominio: number;
  nombre: string;
  correo: string;
  rol: string;
  estado: string;
};

/**
 * Stripe Connect con Accounts v2 para el cobro de cuotas.
 *
 * Modelo elegido (verificado contra la cuenta de prueba del proyecto):
 *  - `dashboard: 'none'`  -> el condominio NO tiene panel de Stripe. Se gestiona
 *    desde Elyx con los componentes embebidos.
 *  - `fees_collector: 'stripe'`   -> Stripe le cobra SU comision al condominio.
 *  - `losses_collector: 'stripe'` -> Elyx NO absorbe contracargos ni saldos
 *    negativos. Elyx no es intermediario: el dinero nunca pasa por su balance.
 *
 * **Por que `none` y no `full`** (antecedente completo en
 * `docs/decision-connect-dashboard-none.md`):
 *  - Con `full` el administrador salia de Elyx a un registro largo, tenia que
 *    inventar una pagina web, atravesaba pantallas de productos que no pidio
 *    (Radar, Stripe Tax, Climate) y terminaba con una herramienta de pagos
 *    completa que duplica —y puede desconfigurar— el cobro de Elyx.
 *  - `express` no sirve: obliga a `fees_collector` y `losses_collector` en
 *    `application`, es decir, a que Elyx absorba los contracargos.
 *  - Verificado contra la API: con `none` las tres responsabilidades quedan en
 *    `stripe` (incluido el KYC) e intentar `losses_collector: 'application'`
 *    responde `account_creation_losses_collector_unavailable`.
 *
 * **Ojo con el dashboard**: es **inmutable**. Cambiarlo exige crear una cuenta
 * nueva y repetir el KYC completo.
 */
@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeClient: StripeClientService,
  ) {}

  private get stripe(): Stripe | null {
    return this.stripeClient.cliente;
  }

  /** `true` cuando hay credenciales de Stripe configuradas. */
  get disponible(): boolean {
    return this.stripeClient.disponible;
  }

  // ---------------------------------------------------------------------------
  // Creacion de la cuenta
  // ---------------------------------------------------------------------------

  /**
   * Crea la cuenta conectada del condominio, o devuelve la que ya existe.
   *
   * Idempotente a proposito: el administrador puede pulsar "Conectar" varias
   * veces sin generar cuentas duplicadas en Stripe.
   */
  async crearOReutilizarCuenta(
    idCondominio: number,
    idUsuarioCondominio?: number | null,
  ): Promise<EstadoCuentaConnect> {
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException(
        'Stripe no esta configurado en esta instancia. Usa transferencia SPEI.',
      );
    }

    const datos = await this.datosCondominio(idCondominio, idUsuarioCondominio);

    // Ya existe: no se crea otra, se devuelve su estado real.
    if (datos.stripeAccountId) {
      return this.consultarEstado(idCondominio);
    }

    // Stripe revisa la URL del negocio antes de habilitar los cobros. Crear la
    // cuenta con la pagina incompleta deja la cuenta restringida y obliga a
    // rehacer el tramite, asi que se bloquea antes de llamar a Stripe.
    if (!datos.correoContacto || !datos.telefonoContacto) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PAGINA_PUBLICA_INCOMPLETA',
        message:
          'Antes de conectar Stripe necesitas capturar el correo y el telefono de atencion a ' +
          'condominos: Stripe revisa la pagina publica del condominio para verificar el negocio ' +
          'y rechaza las cuentas sin datos de contacto.',
      });
    }

    const telefono = this.normalizarTelefono(datos.telefonoContacto);
    const correoAtencion = datos.correoContacto?.trim() || null;

    /**
     * Payload de creacion.
     *
     * Los datos de contacto salen de la pagina publica del condominio: son los
     * mismos que ya capturo el administrador, asi que no tiene que escribirlos
     * otra vez en el formulario de Stripe.
     */
    const construirPayload = (incluirMcc: boolean): Stripe.V2.Core.AccountCreateParams => ({
      display_name: datos.nombre,
      ...(datos.correoAdmin ? { contact_email: datos.correoAdmin } : {}),
      ...(telefono ? { contact_phone: telefono } : {}),
      identity: {
        country: 'mx',
        entity_type: 'company',
        business_details: {
          registered_name: datos.razonSocial ?? datos.nombre,
          ...(telefono ? { phone: telefono } : {}),
        },
      },
      configuration: {
        merchant: {
          ...(incluirMcc ? { mcc: MCC_ASOCIACIONES } : {}),
          ...(correoAtencion || telefono
            ? {
                support: {
                  ...(correoAtencion ? { email: correoAtencion } : {}),
                  ...(telefono ? { phone: telefono } : {}),
                  url: this.businessUrl(idCondominio),
                },
              }
            : {}),
          capabilities: {
            card_payments: { requested: true },
            // Con `dashboard: 'none'` Stripe cae en la columna "Express or other
            // Dashboard", donde las capacidades de metodos de pago NO se activan
            // solas: si no se pide, Link nunca aparece en el checkout.
            link_payments: { requested: true },
          },
        },
      },
      defaults: {
        currency: 'mxn',
        // `es-MX` NO es un enum valido en Stripe; para LatAm es `es-419`.
        locales: ['es-419'],
        profile: {
          // La URL publica del condominio es lo que Stripe revisa para verificar
          // el negocio. Se prellena para que el administrador no tenga que
          // inventar un sitio que no existe.
          business_url: this.businessUrl(idCondominio),
          product_description: this.descripcionProducto(datos),
        },
        responsibilities: {
          // Stripe cobra sus comisiones directamente al condominio...
          fees_collector: 'stripe',
          // ...y absorbe los saldos negativos. Elyx queda fuera de la ecuacion.
          // `requirements_collector` NO se puede enviar: la API lo rechaza como
          // "Unknown field" y lo deriva a `stripe`, que es lo que queremos (KYC).
          losses_collector: 'stripe',
        },
      },
      dashboard: 'none',
      metadata: { idCondominio: String(idCondominio) },
      include: ['configuration.merchant', 'identity', 'defaults', 'requirements'],
    });

    let cuenta: Stripe.V2.Core.Account;
    try {
      cuenta = await stripe.v2.core.accounts.create(construirPayload(true));
    } catch (error) {
      // El MCC es una sugerencia: si Stripe no lo acepta para este tipo de
      // negocio (o la version de API no lo reconoce), se crea la cuenta sin el
      // y el administrador lo elige en el onboarding. Nunca se bloquea el cobro
      // por un campo opcional.
      const codigo = (error as { code?: string }).code;
      if (codigo !== 'mcc_invalid' && codigo !== 'parameter_unknown') {
        throw error;
      }
      this.logger.warn(
        `Stripe rechazo el MCC ${MCC_ASOCIACIONES} para el condominio ${idCondominio} ` +
          `(${codigo}); se crea la cuenta sin MCC.`,
      );
      cuenta = await stripe.v2.core.accounts.create(construirPayload(false));
    }

    await this.guardarCuenta(idCondominio, cuenta);

    this.logger.log(
      `Cuenta Connect v2 creada para el condominio ${idCondominio}: ${cuenta.id} ` +
        `(dashboard: ${cuenta.dashboard})`,
    );

    return this.consultarEstado(idCondominio);
  }

  /**
   * Crea una Account Session para montar el onboarding dentro de Elyx.
   *
   * Es lo que sustituye al onboarding hospedado: el componente de Stripe se
   * renderiza en la propia interfaz, asi que el administrador no sale de Elyx y
   * nunca ve el dashboard.
   *
   * **Los tres componentes son obligatorios**, no opcionales: cuando Stripe es
   * responsable de los saldos negativos (nuestro caso) exige onboarding, gestion
   * de la cuenta y el banner de avisos, para que el condominio pueda resolver
   * por su cuenta los requisitos que Stripe le pida.
   *
   * Ojo: `accountSessions` es un endpoint **v1** aunque la cuenta sea v2.
   */
  async crearSesionOnboarding(
    idCondominio: number,
    idUsuarioCondominio?: number | null,
  ): Promise<{ clientSecret: string }> {
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException(
        'Stripe no esta configurado en esta instancia. Usa transferencia SPEI.',
      );
    }

    const estado = await this.crearOReutilizarCuenta(idCondominio, idUsuarioCondominio);
    if (!estado.stripeAccountId) {
      throw new BadRequestException('No fue posible crear la cuenta de Stripe del condominio.');
    }

    const sesion = await stripe.accountSessions.create({
      account: estado.stripeAccountId,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
      },
    });

    if (!sesion.client_secret) {
      throw new BadRequestException('Stripe no devolvio el secreto de la sesion de onboarding.');
    }

    return { clientSecret: sesion.client_secret };
  }

  /**
   * Genera el enlace de onboarding hospedado por Stripe.
   *
   * El administrador completa ahi el RFC, la cuenta bancaria y la verificacion
   * de identidad. Elyx nunca ve esos datos: los recoge Stripe directamente.
   */
  async crearEnlaceOnboarding(
    idCondominio: number,
    idUsuarioCondominio?: number | null,
  ): Promise<{ url: string }> {
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException(
        'Stripe no esta configurado en esta instancia. Usa transferencia SPEI.',
      );
    }

    const estado = await this.crearOReutilizarCuenta(idCondominio, idUsuarioCondominio);
    if (!estado.stripeAccountId) {
      throw new BadRequestException('No fue posible crear la cuenta de Stripe del condominio.');
    }

    const base = this.baseUrl();

    // En v2 la forma cambio: todo va dentro de `use_case`, no en la raiz.
    const enlace = await stripe.v2.core.accountLinks.create({
      account: estado.stripeAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          refresh_url: `${base}/connect/refresh?idCondominio=${idCondominio}`,
          return_url: `${base}/connect/return?idCondominio=${idCondominio}`,
          // `eventually_due` pide todo de una vez en lugar de ir por partes:
          // para un tramite unico es menos frustrante que tres rondas.
          collection_options: { fields: 'eventually_due' },
        },
      },
    });

    return { url: enlace.url };
  }

  // ---------------------------------------------------------------------------
  // Administradores como propietarios de la cuenta
  // ---------------------------------------------------------------------------

  /**
   * Administradores activos y su Person en Stripe.
   *
   * La cuenta conectada es del condominio, no de la persona que la creo. Para
   * que un administrador nuevo pueda responder por la cuenta (y completar el
   * KYC si Stripe lo pide), debe existir como `Person` con `owner: true`.
   *
   * `huerfanos` son Personas que ya no corresponden a un administrador activo
   * (degradado, dado de baja o miembro de otro rol). No se borran solas: la
   * baja se confirma desde el panel para no eliminar un representante legal que
   * Stripe haya creado durante el onboarding.
   */
  async listarAdministradores(idCondominio: number): Promise<EstadoAdministradoresStripe> {
    const datos = await this.datosCondominio(idCondominio);
    const miembros = await this.miembrosCondominio(idCondominio);
    const admins = miembros.filter(
      (miembro) => miembro.rol === 'ADMINISTRADOR' && miembro.estado === 'ACTIVO',
    );

    const base: EstadoAdministradoresStripe = {
      tieneCuenta: Boolean(datos.stripeAccountId),
      stripeAccountId: datos.stripeAccountId,
      administradores: admins.map((miembro) => ({
        idUsuarioCondominio: miembro.idUsuarioCondominio,
        nombre: miembro.nombre,
        correo: miembro.correo,
        stripePersonId: null,
        propietario: false,
        representante: false,
      })),
      huerfanos: [],
      advertencias: [],
    };

    if (!datos.stripeAccountId) {
      return base;
    }

    const stripe = this.stripe;
    if (!stripe) {
      return { ...base, advertencias: ['Stripe no esta configurado en esta instancia.'] };
    }

    let personas: PersonaStripe[] = [];
    try {
      personas = await this.leerPersonas(stripe, datos.stripeAccountId);
    } catch (error) {
      // El panel de cobro debe seguir mostrando SPEI y datos publicos aunque
      // Stripe no responda: se informa sin romper la pantalla.
      return {
        ...base,
        advertencias: [
          `No se pudo consultar la lista de personas en Stripe: ${(error as Error).message}`,
        ],
      };
    }

    const administradores: AdministradorStripe[] = admins.map((miembro) => {
      const persona = this.buscarPersona(personas, miembro);
      return {
        idUsuarioCondominio: miembro.idUsuarioCondominio,
        nombre: miembro.nombre,
        correo: miembro.correo,
        stripePersonId: persona?.id ?? null,
        propietario: Boolean(persona?.relationship?.owner),
        representante: Boolean(persona?.relationship?.representative),
      };
    });

    const vinculadas = new Set(
      administradores
        .map((admin) => admin.stripePersonId)
        .filter((id): id is string => Boolean(id)),
    );

    const huerfanos: PersonaHuerfanaStripe[] = [];
    for (const persona of personas) {
      if (vinculadas.has(persona.id)) {
        continue;
      }

      const idMembresia = Number(persona.metadata?.idUsuarioCondominio ?? 0);
      const correoPersona = String(persona.email ?? '').trim().toLowerCase();
      const miembro =
        miembros.find((item) => item.idUsuarioCondominio === idMembresia) ??
        (correoPersona
          ? miembros.find((item) => item.correo === correoPersona)
          : undefined);

      // Sin vínculo con Elyx: probablemente la creó Stripe en el onboarding
      // (representante legal). No es huérfana ni se ofrece borrarla.
      if (!miembro) {
        continue;
      }

      if (miembro.rol !== 'ADMINISTRADOR') {
        huerfanos.push({
          stripePersonId: persona.id,
          nombre: this.nombrePersona(persona),
          correo: persona.email ?? null,
          motivo: 'condomino',
        });
        continue;
      }

      if (miembro.estado !== 'ACTIVO') {
        huerfanos.push({
          stripePersonId: persona.id,
          nombre: this.nombrePersona(persona),
          correo: persona.email ?? null,
          motivo: 'inactivo',
        });
      }
    }

    return { ...base, administradores, huerfanos };
  }

  /**
   * Crea o adopta la Person de cada administrador activo.
   *
   * - Si Stripe ya creó una Person con el mismo correo durante el onboarding,
   *   se adopta (se le agrega la metadata) en vez de duplicarla.
   * - Si no existe, se crea como `owner`. El primero (o quien inicia el
   *   onboarding) queda además como representante si aún no hay uno.
   * - Cada alta va aislada: si Stripe pide más datos para una persona, se
   *   devuelve como advertencia y las demás se sincronizan igual.
   */
  async sincronizarAdministradores(
    idCondominio: number,
    idUsuarioCondominioActor?: number | null,
  ): Promise<EstadoAdministradoresStripe> {
    const datos = await this.datosCondominio(idCondominio, idUsuarioCondominioActor);
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException('Stripe no esta configurado en esta instancia.');
    }
    if (!datos.stripeAccountId) {
      throw new BadRequestException('El condominio aun no tiene una cuenta de Stripe.');
    }

    const miembros = await this.miembrosCondominio(idCondominio);
    const admins = miembros.filter(
      (miembro) => miembro.rol === 'ADMINISTRADOR' && miembro.estado === 'ACTIVO',
    );

    let personas: PersonaStripe[] = [];
    try {
      personas = await this.leerPersonas(stripe, datos.stripeAccountId);
    } catch (error) {
      throw new BadRequestException(
        `No se pudo consultar la lista de personas en Stripe: ${(error as Error).message}`,
      );
    }

    const telefono = this.normalizarTelefono(datos.telefonoContacto);
    const actor = admins.find(
      (miembro) => miembro.idUsuarioCondominio === Number(idUsuarioCondominioActor ?? 0),
    );
    const primero = actor ?? admins[0];
    let representanteTomado = personas.some((persona) =>
      Boolean(persona.relationship?.representative),
    );
    const advertencias: string[] = [];

    for (const admin of admins) {
      const existente = this.buscarPersona(personas, admin);
      const metadata = {
        idUsuarioCondominio: String(admin.idUsuarioCondominio),
        idCondominio: String(idCondominio),
        origen: 'elyx',
      };

      try {
        if (existente) {
          /*
           * El tipo exacto de `PersonUpdateParams` vive en un namespace que el
           * SDK no expone desde `Stripe`; se usa un objeto plano y se castea en
           * la llamada. Los campos son los mismos que documenta Stripe.
           */
          if (
            String(existente.metadata?.idUsuarioCondominio ?? '') !==
            metadata.idUsuarioCondominio
          ) {
            try {
              await stripe.v2.core.accounts.persons.update(
                datos.stripeAccountId,
                existente.id,
                { metadata } as Parameters<typeof stripe.v2.core.accounts.persons.update>[2],
              );
            } catch (error) {
              advertencias.push(
                `${admin.nombre || admin.correo}: no se pudo vincular su Person de Stripe (${(error as Error).message}).`,
              );
            }
          }

          // El nombre solo se completa si falta: no se pisan datos que el
          // administrador ya haya corregido en el formulario de Stripe.
          const nombre = this.partirNombre(admin.nombre);
          const cambiosNombre: Record<string, unknown> = {};
          if (!existente.given_name && nombre.given_name) {
            cambiosNombre.given_name = nombre.given_name;
          }
          if (!existente.surname && nombre.surname) {
            cambiosNombre.surname = nombre.surname;
          }

          if (Object.keys(cambiosNombre).length > 0) {
            try {
              await stripe.v2.core.accounts.persons.update(
                datos.stripeAccountId,
                existente.id,
                cambiosNombre as Parameters<typeof stripe.v2.core.accounts.persons.update>[2],
              );
            } catch {
              // El nombre no es critico para operar la cuenta: si Stripe lo
              // bloquea, se conserva lo que ya tenia.
            }
          }
          continue;
        }

        const debeSerRepresentante =
          !representanteTomado &&
          Boolean(primero) &&
          primero.idUsuarioCondominio === admin.idUsuarioCondominio;
        const nombre = this.partirNombre(admin.nombre);

        const datosPersona = {
          ...(nombre.given_name ? { given_name: nombre.given_name } : {}),
          ...(nombre.surname ? { surname: nombre.surname } : {}),
          ...(admin.correo ? { email: admin.correo } : {}),
          ...(telefono ? { phone: telefono } : {}),
          metadata,
        };

        try {
          await stripe.v2.core.accounts.persons.create(datos.stripeAccountId, {
            ...datosPersona,
            relationship: {
              owner: true,
              ...(debeSerRepresentante ? { representative: true } : {}),
            },
          });
        } catch (error) {
          /*
           * Despues de un Account Link/Session Stripe bloquea la escritura de
           * `relationship` ("You do not have permission to write to
           * relationship"). El KYC lo controla Stripe. Se registra la persona
           * con su identidad y se avisa que el rol de propietario debe
           * completarse desde el formulario de Stripe.
           */
          const mensaje = (error as Error).message ?? '';
          if (!/relationship/i.test(mensaje)) {
            throw error;
          }

          await stripe.v2.core.accounts.persons.create(datos.stripeAccountId, datosPersona);
          advertencias.push(
            `${admin.nombre || admin.correo}: Stripe no permite asignarlo como propietario por API ` +
              'despues del onboarding. Se registró su identidad; para que figure como propietario, ' +
              'agrégalo desde "Actualizar datos en Stripe".',
          );
        }

        if (debeSerRepresentante) {
          representanteTomado = true;
        }
      } catch (error) {
        advertencias.push(
          `${admin.nombre || admin.correo}: ${(error as Error).message}`,
        );
      }
    }

    const estado = await this.listarAdministradores(idCondominio);
    return {
      ...estado,
      advertencias: [...estado.advertencias, ...advertencias],
    };
  }

  /**
   * Quita una Person de la cuenta conectada.
   *
   * Se usa tanto para un administrador dado de baja como para una Person
   * huérfana. Si Stripe la protege (por ejemplo, el último representante), se
   * devuelve el motivo en lugar de un 500.
   */
  async quitarAdministrador(
    idCondominio: number,
    stripePersonId: string,
  ): Promise<{ eliminado: boolean; motivo: string | null }> {
    const datos = await this.datosCondominio(idCondominio);
    const stripe = this.stripe;

    if (!stripe || !datos.stripeAccountId) {
      return { eliminado: false, motivo: 'El condominio no tiene una cuenta de Stripe.' };
    }

    try {
      await stripe.v2.core.accounts.persons.del(datos.stripeAccountId, stripePersonId);
      return { eliminado: true, motivo: null };
    } catch (error) {
      return { eliminado: false, motivo: (error as Error).message };
    }
  }

  /** Miembros del condominio con el nombre ya armado. */
  private async miembrosCondominio(idCondominio: number): Promise<MiembroCondominio[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        uc.id_usuario_condominio,
        uc.rol,
        uc.estado,
        u.correo,
        TRIM(CONCAT_WS(' ', u.nombre, u.primer_apellido, u.segundo_apellido)) AS nombre
      FROM usuarios_condominios uc
      JOIN usuarios u ON u.id_usuario = uc.id_usuario
      WHERE uc.id_condominio = $1
      ORDER BY (uc.rol = 'ADMINISTRADOR') DESC, u.nombre
      `,
      [idCondominio],
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      idUsuarioCondominio: Number(row.id_usuario_condominio),
      nombre: String(row.nombre ?? '').trim(),
      correo: String(row.correo ?? '').trim().toLowerCase(),
      rol: String(row.rol ?? 'CONDOMINO'),
      estado: String(row.estado ?? 'INACTIVO'),
    }));
  }

  /**
   * Personas de la cuenta conectada.
   *
   * El listado v2 devuelve `{ data }`; se normaliza porque el SDK tipa la
   * respuesta como una promesa con paginación y no conviene depender de la
   * forma exacta en el resto del servicio.
   */
  private async leerPersonas(
    stripe: Stripe,
    stripeAccountId: string,
  ): Promise<PersonaStripe[]> {
    /*
     * El listado v2 de Personas limita `limit` a 20 (verificado contra la API:
     * "Limit must be greater than 0, and cannot be greater than 20"). Un
     * condominio con mas de 20 administradores es improbable; si algun dia
     * ocurre, las personas sobrantes se sincronizan en una segunda pasada.
     */
    const respuesta = (await stripe.v2.core.accounts.persons.list(stripeAccountId, {
      limit: 20,
    })) as unknown as { data?: PersonaStripe[] } | PersonaStripe[];

    const personas = Array.isArray(respuesta) ? respuesta : respuesta.data;

    return (personas ?? []).map((persona) => ({
      id: String(persona.id),
      given_name: persona.given_name ?? null,
      surname: persona.surname ?? null,
      email: persona.email ?? null,
      phone: persona.phone ?? null,
      relationship: persona.relationship ?? null,
      metadata: (persona.metadata ?? null) as Record<string, string> | null,
    }));
  }

  /** Persona vinculada por metadata o, en su defecto, por correo. */
  private buscarPersona(
    personas: PersonaStripe[],
    miembro: MiembroCondominio,
  ): PersonaStripe | undefined {
    const porMetadata = personas.find(
      (persona) =>
        String(persona.metadata?.idUsuarioCondominio ?? '') ===
        String(miembro.idUsuarioCondominio),
    );
    if (porMetadata) {
      return porMetadata;
    }

    return personas.find(
      (persona) =>
        String(persona.email ?? '').trim().toLowerCase() === miembro.correo.toLowerCase(),
    );
  }

  private nombrePersona(persona: PersonaStripe): string {
    const nombre = [persona.given_name, persona.surname]
      .filter((parte) => Boolean(parte))
      .map((parte) => String(parte))
      .join(' ')
      .trim();
    return nombre || persona.email || persona.id;
  }

  /** Separa el nombre completo en los dos campos que pide Stripe. */
  private partirNombre(nombreCompleto: string): { given_name?: string; surname?: string } {
    const partes = String(nombreCompleto ?? '')
      .split(/\s+/)
      .filter(Boolean);

    if (partes.length === 0) {
      return {};
    }

    const [givenName, ...resto] = partes;
    return {
      given_name: givenName,
      ...(resto.length > 0 ? { surname: resto.join(' ') } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  /**
   * Estado real de la cuenta consultado a Stripe.
   *
   * Se consulta en vivo en lugar de confiar en la copia local: los requisitos
   * de Stripe cambian sin avisar (una verificacion que caduca, un documento
   * nuevo) y una copia vieja diria "puede cobrar" cuando ya no.
   */
  async consultarEstado(idCondominio: number): Promise<EstadoCuentaConnect> {
    const datos = await this.datosCondominio(idCondominio);

    if (!datos.stripeAccountId) {
      return {
        tieneCuenta: false,
        stripeAccountId: null,
        estadoCapacidad: 'sin-cuenta',
        puedeCobrar: false,
        requisitosPendientes: [],
        motivo: 'El condominio aun no conecto su cuenta de Stripe.',
        puedeContinuarOnboarding: true,
        conectadoEn: null,
        dashboard: null,
      };
    }

    const stripe = this.stripe;
    if (!stripe) {
      return {
        tieneCuenta: true,
        stripeAccountId: datos.stripeAccountId,
        estadoCapacidad: 'unknown',
        puedeCobrar: datos.stripeChargesEnabled,
        requisitosPendientes: [],
        motivo: 'Stripe no esta configurado en esta instancia.',
        puedeContinuarOnboarding: false,
        conectadoEn: datos.stripeConectadoEn,
        dashboard: null,
      };
    }

    try {
      const cuenta = await stripe.v2.core.accounts.retrieve(datos.stripeAccountId, {
        include: ['configuration.merchant', 'requirements', 'defaults'],
      });

      const capacidad = cuenta.configuration?.merchant?.capabilities?.card_payments;
      const estadoCapacidad = this.mapearCapacidad(capacidad?.status);
      const puedeCobrar = estadoCapacidad === 'active';
      const requisitos = this.requisitosPendientes(cuenta);

      // Se sincroniza la copia local: `puedeCobrar` es lo que consulta el
      // cobro para decidir si ofrece tarjeta.
      await this.actualizarCapacidadLocal(idCondominio, puedeCobrar);

      return {
        tieneCuenta: true,
        stripeAccountId: datos.stripeAccountId,
        estadoCapacidad,
        puedeCobrar,
        requisitosPendientes: requisitos,
        motivo: puedeCobrar
          ? null
          : requisitos.length > 0
            ? `Stripe pide mas informacion para activar los cobros: ${requisitos.slice(0, 4).join(', ')}.`
            : 'Stripe aun esta verificando la cuenta. Suele tardar unos minutos.',
        puedeContinuarOnboarding: !puedeCobrar,
        conectadoEn: datos.stripeConectadoEn,
        dashboard: cuenta.dashboard ? String(cuenta.dashboard) : null,
      };
    } catch (error) {
      this.logger.warn(
        `No fue posible consultar la cuenta ${datos.stripeAccountId}: ${(error as Error).message}`,
      );
      return {
        tieneCuenta: true,
        stripeAccountId: datos.stripeAccountId,
        estadoCapacidad: 'unknown',
        puedeCobrar: datos.stripeChargesEnabled,
        requisitosPendientes: [],
        motivo: 'No fue posible consultar el estado en Stripe. Intenta de nuevo en un momento.',
        puedeContinuarOnboarding: true,
        conectadoEn: datos.stripeConectadoEn,
        dashboard: null,
      };
    }
  }

  /** Sincroniza el estado de la cuenta desde un evento de Stripe. */
  async sincronizarDesdeStripe(stripeAccountId: string, puedeCobrar: boolean): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuentas_cobro_condominio
      SET stripe_charges_enabled = $2, actualizado_en = NOW()
      WHERE stripe_account_id = $1
      `,
      [stripeAccountId, puedeCobrar],
    );
  }

  /** `true` si el condominio tiene una cuenta que puede cobrar con tarjeta. */
  async puedeCobrarConTarjeta(idCondominio: number): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      SELECT stripe_account_id, stripe_charges_enabled
      FROM cuentas_cobro_condominio
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      return false;
    }
    const row = rows[0] as Record<string, unknown>;
    return Boolean(row.stripe_account_id) && Boolean(row.stripe_charges_enabled);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Datos del condominio que alimentan la cuenta Connect.
   *
   * `idUsuarioCondominio` es quien inicia el onboarding: su correo se usa como
   * `contact_email`. Si no se recibe (o ya no es administrador activo), se cae
   * al primer administrador activo para no dejar la cuenta sin contacto.
   */
  private async datosCondominio(
    idCondominio: number,
    idUsuarioCondominio?: number | null,
  ): Promise<{
    nombre: string;
    razonSocial: string | null;
    rfc: string | null;
    correoAdmin: string | null;
    descripcionPublica: string | null;
    correoContacto: string | null;
    telefonoContacto: string | null;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    stripeConectadoEn: string | null;
  }> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.nombre,
        c.razon_social,
        c.rfc,
        c.descripcion_publica,
        c.correo_contacto,
        c.telefono_contacto,
        cc.stripe_account_id,
        cc.stripe_charges_enabled,
        cc.stripe_conectado_en,
        (SELECT u.correo FROM usuarios_condominios uc
          JOIN usuarios u ON u.id_usuario = uc.id_usuario
          WHERE uc.id_condominio = c.id_condominio
            AND uc.rol = 'ADMINISTRADOR'
            AND uc.estado = 'ACTIVO'
          ORDER BY (uc.id_usuario_condominio = $2) DESC NULLS LAST,
                   uc.id_usuario_condominio
          LIMIT 1) AS correo_admin
      FROM condominios c
      LEFT JOIN cuentas_cobro_condominio cc ON cc.id_condominio = c.id_condominio
      WHERE c.id_condominio = $1
      LIMIT 1
      `,
      [idCondominio, idUsuarioCondominio ?? null],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      nombre: String(row.nombre ?? ''),
      razonSocial: row.razon_social ? String(row.razon_social) : null,
      rfc: row.rfc ? String(row.rfc) : null,
      correoAdmin: row.correo_admin ? String(row.correo_admin) : null,
      descripcionPublica: row.descripcion_publica ? String(row.descripcion_publica) : null,
      correoContacto: row.correo_contacto ? String(row.correo_contacto) : null,
      telefonoContacto: row.telefono_contacto ? String(row.telefono_contacto) : null,
      stripeAccountId: row.stripe_account_id ? String(row.stripe_account_id) : null,
      stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
      stripeConectadoEn: row.stripe_conectado_en
        ? new Date(String(row.stripe_conectado_en)).toISOString()
        : null,
    };
  }

  /**
   * URL publica del condominio que se declara a Stripe como `business_url`.
   *
   * **Stripe rechaza las URLs que no sean alcanzables publicamente.** Verificado
   * contra la API: con `PUBLIC_APP_URL=http://localhost:5173` responde
   * `400 Invalid URL`, porque `localhost` no es un sitio que Stripe pueda
   * revisar. Un `http://` tampoco sirve.
   *
   * Por eso se puede configurar `STRIPE_BUSINESS_BASE_URL` aparte del frontend
   * (por ejemplo un tunel en desarrollo o el dominio de produccion) y se falla
   * con un mensaje accionable en lugar de dejar que Stripe responda con un error
   * opaco: si la URL no sirve, la cuenta se crearia con la pagina equivocada y
   * quedaria restringida.
   */
  private businessUrl(idCondominio: number): string {
    const explicita = (process.env.STRIPE_BUSINESS_BASE_URL ?? '').trim();
    const base = (explicita || process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '')
      .trim()
      .replace(/\/+$/, '');

    if (!/^https:\/\//i.test(base)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'URL_PUBLICA_REQUERIDA',
        message:
          'Stripe necesita que la pagina del condominio este en una URL publica con https para ' +
          'poder verificarla. Configura STRIPE_BUSINESS_BASE_URL con el dominio real (o un tunel ' +
          'publico en desarrollo): la URL actual es ' +
          (base || '(vacia)') +
          '.',
      });
    }

    return `${base}/condominio/${idCondominio}`;
  }

  /**
   * Descripcion del producto para Stripe.
   *
   * Se prefiere la que escribio el administrador; si no hay, se genera una
   * generica con el nombre del condominio.
   *
   * **Comportamiento verificado**: cuando se envia junto con `business_url`,
   * Stripe **descarta** la descripcion y deja solo la URL (el requisito resuelto
   * es el de la URL, y `product_description` ni aparece en `requirements`). No
   * es un error: la documentacion los plantea como alternativa —"si el negocio
   * no tiene URL, prellena la descripcion"— y la descripcion ya se publica en la
   * propia pagina, que es lo que Stripe revisa.
   *
   * Se sigue enviando porque en algunos paises Stripe exige las dos, y despues
   * de crear una Account Session el campo queda bloqueado
   * (`permission to write to defaults.profile.product_description`).
   */
  private descripcionProducto(datos: {
    nombre: string;
    descripcionPublica: string | null;
  }): string {
    const propia = String(datos.descripcionPublica ?? '').trim();
    if (propia.length > 0) {
      return propia.slice(0, 500);
    }
    return `Administración y cobro de cuotas de mantenimiento del condominio ${datos.nombre}.`;
  }

  private async guardarCuenta(idCondominio: number, cuenta: { id: string }): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO cuentas_cobro_condominio (
        id_condominio, spei_activo, stripe_activo, stripe_account_id,
        stripe_charges_enabled, stripe_conectado_en
      )
      VALUES ($1, FALSE, TRUE, $2, FALSE, NOW())
      ON CONFLICT (id_condominio) DO UPDATE SET
        stripe_activo = TRUE,
        stripe_account_id = $2,
        stripe_conectado_en = COALESCE(cuentas_cobro_condominio.stripe_conectado_en, NOW()),
        actualizado_en = NOW()
      `,
      [idCondominio, cuenta.id],
    );
  }

  private async actualizarCapacidadLocal(
    idCondominio: number,
    puedeCobrar: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuentas_cobro_condominio
      SET stripe_charges_enabled = $2, actualizado_en = NOW()
      WHERE id_condominio = $1 AND stripe_charges_enabled IS DISTINCT FROM $2
      `,
      [idCondominio, puedeCobrar],
    );
  }

  private mapearCapacidad(
    estado: string | undefined,
  ): 'active' | 'restricted' | 'pending' | 'unknown' {
    if (estado === 'active') return 'active';
    if (estado === 'restricted') return 'restricted';
    if (estado === 'pending') return 'pending';
    return 'unknown';
  }

  /**
   * Requisitos que Stripe marca como vencidos o pendientes.
   *
   * En v2 los requisitos viven en un arreglo unico (`requirements.entries`) y
   * cada uno lleva su propio `minimum_deadline.status`, a diferencia de v1 que
   * tenia listas separadas (`currently_due`, `past_due`, `eventually_due`).
   * El nombre legible esta en `description`; no existe un campo `requirement`.
   *
   * `eventually_due` se omite a proposito: son requisitos futuros que no
   * bloquean el cobro hoy, y mostrarlos asustaria sin motivo.
   */
  private requisitosPendientes(cuenta: {
    requirements?: {
      entries?: Array<{
        description?: string;
        minimum_deadline?: { status?: string };
      }>;
    };
  }): string[] {
    const entradas = cuenta.requirements?.entries ?? [];
    return entradas
      .filter((entrada) => {
        const estado = entrada.minimum_deadline?.status;
        return estado === 'past_due' || estado === 'currently_due';
      })
      .map((entrada) => String(entrada.description ?? ''))
      .filter((nombre) => nombre.length > 0);
  }

  /**
   * Deja el telefono en un formato que Stripe acepta (`+525555555555`).
   *
   * El campo de la pagina publica admite espacios, guiones y parentesis para
   * que el administrador escriba comodo; Stripe no. Si no queda un numero
   * plausible se devuelve `null` y el campo simplemente no se envia.
   */
  private normalizarTelefono(valor: string | null): string | null {
    const limpio = String(valor ?? '').trim();
    if (!limpio) {
      return null;
    }
    const digitos = limpio.replace(/\D/g, '');
    if (digitos.length < 7 || digitos.length > 15) {
      return null;
    }
    if (limpio.startsWith('+')) {
      return `+${digitos}`;
    }
    // La plataforma es para Mexico (`identity.country = 'mx'`): si el
    // administrador escribio el numero local de 10 digitos, se le agrega la
    // lada. Stripe rechaza telefonos sin "+" (`phone_invalid`).
    if (digitos.length === 10) {
      return `+52${digitos}`;
    }
    return `+${digitos}`;
  }

  private baseUrl(): string {
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .trim()
      .replace(/\/+$/, '');
    return base.length > 0 ? base : 'http://localhost:5173';
  }
}
