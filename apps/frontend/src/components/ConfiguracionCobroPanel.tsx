import { useCallback, useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
import { ConnectOnboarding } from './ConnectOnboarding';
import {
  cobrosApi,
  type ConfiguracionCobro,
  type EstadoAdministradoresStripe,
  type EstadoConnect,
} from '../services/cobros.service';

type ConfiguracionCobroPanelProps = {
  idCondominio: number;
};

const MONEDA = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

/** Etiqueta legible de cada requisito que Stripe necesita. */
const ETIQUETA_REQUISITO: Record<string, string> = {
  rfc: 'RFC del condominio',
  descripcionPublica: 'Descripción de los servicios',
  correoContacto: 'Correo de atención',
  telefonoContacto: 'Teléfono de atención',
};

/**
 * Configuración de cómo cobra el condominio sus cuotas.
 *
 * Tres bloques, en el orden en que hay que resolverlos:
 *
 *  1. **Datos públicos.** Stripe revisa la página `/condominio/:id` para
 *     verificar el negocio: exige nombre, descripción de los servicios y datos
 *     de contacto. Sin ellos la cuenta conectada no se puede crear, así que se
 *     capturan aquí y la sección de tarjeta queda deshabilitada con el motivo a
 *     la vista.
 *  2. **SPEI.** Solo necesita una CLABE. Funciona para todos los condominios,
 *     incluidos los que no tienen RFC.
 *  3. **Tarjeta (Stripe Connect).** El onboarding se monta **dentro de Elyx**:
 *     el administrador no sale de la aplicación y nunca obtiene dashboard de
 *     Stripe. La comisión la absorbe el condominio y se muestra antes de
 *     activar, porque es dinero suyo.
 */
export function ConfiguracionCobroPanel({ idCondominio }: ConfiguracionCobroPanelProps) {
  const [config, setConfig] = useState<ConfiguracionCobro | null>(null);
  const [connect, setConnect] = useState<EstadoConnect | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Datos públicos
  const [descripcion, setDescripcion] = useState('');
  const [correoContacto, setCorreoContacto] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  // Igual que los datos fiscales: una vez completos se muestra un resumen y
  // el formulario solo vuelve a aparecer al pulsar "Editar".
  const [editandoPublico, setEditandoPublico] = useState(false);

  // Formulario SPEI
  const [clabe, setClabe] = useState('');
  const [banco, setBanco] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [prefijo, setPrefijo] = useState('');
  const [permitirMsi, setPermitirMsi] = useState(false);
  const [editandoSpei, setEditandoSpei] = useState(false);

  // Onboarding embebido
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparandoOnboarding, setPreparandoOnboarding] = useState(false);

  // Administradores como propietarios de la cuenta conectada
  const [administradores, setAdministradores] = useState<EstadoAdministradoresStripe | null>(null);
  const [cargandoAdministradores, setCargandoAdministradores] = useState(false);
  const [sincronizandoAdministradores, setSincronizandoAdministradores] = useState(false);
  const [errorAdministradores, setErrorAdministradores] = useState<string | null>(null);
  const [avisoAdministradores, setAvisoAdministradores] = useState<string | null>(null);

  /**
   * Administradores que existen como propietarios en la cuenta conectada.
   *
   * Solo se consulta cuando hay cuenta: sin Stripe el bloque no tiene nada que
   * mostrar y la peticion fallaria con un 400.
   */
  const cargarAdministradores = useCallback(async () => {
    setCargandoAdministradores(true);
    setErrorAdministradores(null);
    try {
      setAdministradores(await cobrosApi.administradoresStripe(idCondominio));
    } catch (err) {
      setErrorAdministradores(
        extraerMensaje(err, 'No se pudieron consultar los administradores en Stripe.'),
      );
    } finally {
      setCargandoAdministradores(false);
    }
  }, [idCondominio]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await cobrosApi.configuracion(idCondominio);
      setConfig(datos);
      setClabe(datos.clabe ?? '');
      setBanco(datos.banco ?? '');
      setBeneficiario(datos.beneficiario ?? '');
      setPrefijo(datos.referenciaPrefijo ?? '');
      setPermitirMsi(datos.permitirMsi);
      setDescripcion(datos.descripcionPublica ?? '');
      setCorreoContacto(datos.correoContacto ?? '');
      setTelefonoContacto(datos.telefonoContacto ?? '');

      // El estado de Connect se consulta aparte: si falla, la configuración de
      // SPEI y los datos públicos siguen siendo utilizables.
      const estadoConnect = await cobrosApi.estadoConnect(idCondominio).catch(() => null);
      setConnect(estadoConnect);
      if (estadoConnect?.tieneCuenta) {
        void cargarAdministradores();
      } else {
        setAdministradores(null);
      }
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo cargar la configuración de cobro.'));
    } finally {
      setCargando(false);
    }
  }, [cargarAdministradores, idCondominio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Guarda un bloque y devuelve si se guardó.
   *
   * El valor de retorno permite al llamador cerrar el editor **solo** cuando
   * el PATCH salió bien: si falla, el formulario debe seguir abierto con los
   * datos que el administrador escribió.
   */
  const guardar = async (
    cambios: Parameters<typeof cobrosApi.actualizarConfiguracion>[1],
  ): Promise<boolean> => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const datos = await cobrosApi.actualizarConfiguracion(idCondominio, cambios);
      setConfig(datos);
      setAviso('Configuración guardada.');
      return true;
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo guardar la configuración.'));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Prepara el onboarding embebido.
   *
   * Crea (o reutiliza) la cuenta conectada y pide una Account Session. El
   * formulario de Stripe se monta en la propia página, así que el administrador
   * no sale de Elyx.
   */
  const iniciarOnboarding = async () => {
    setPreparandoOnboarding(true);
    setError(null);
    try {
      const { clientSecret: secreto } = await cobrosApi.crearSesionConnect(idCondominio);
      setClientSecret(secreto);
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo iniciar la verificación con Stripe.'));
    } finally {
      setPreparandoOnboarding(false);
    }
  };

  /**
   * Crea o adopta la Person de cada administrador activo.
   *
   * Es idempotente: Stripe devuelve las Personas existentes y el servicio solo
   * completa las que faltan. Por eso se puede pulsar varias veces.
   */
  const sincronizarAdministradores = async () => {
    setSincronizandoAdministradores(true);
    setErrorAdministradores(null);
    setAvisoAdministradores(null);
    try {
      const estado = await cobrosApi.sincronizarAdministradoresStripe(idCondominio);
      setAdministradores(estado);
      setAvisoAdministradores(
        estado.advertencias.length > 0
          ? 'Sincronización parcial: revisa las advertencias de abajo.'
          : 'Administradores sincronizados con Stripe.',
      );
    } catch (err) {
      setErrorAdministradores(
        extraerMensaje(err, 'No se pudieron sincronizar los administradores.'),
      );
    } finally {
      setSincronizandoAdministradores(false);
    }
  };

  const quitarAdministrador = async (idPersona: string, nombre: string) => {
    if (!window.confirm(`¿Quitar a ${nombre} como propietario de la cuenta de Stripe?`)) {
      return;
    }

    setErrorAdministradores(null);
    setAvisoAdministradores(null);
    try {
      const resultado = await cobrosApi.quitarAdministradorStripe(idCondominio, idPersona);
      if (!resultado.eliminado) {
        setErrorAdministradores(
          resultado.motivo ?? 'Stripe no permitió quitar a esta persona.',
        );
        return;
      }
      setAvisoAdministradores(`${nombre} ya no está en la cuenta de Stripe.`);
      await cargarAdministradores();
    } catch (err) {
      setErrorAdministradores(extraerMensaje(err, 'No se pudo quitar a la persona de Stripe.'));
    }
  };

  if (cargando) {
    return (
      <section className="panel animate-in">
        <h4>Cobro de cuotas a los condóminos</h4>
        <p className="muted-text">Cargando...</p>
      </section>
    );
  }

  const faltantes = config?.requisitosConnectFaltantes ?? [];
  const connectBloqueado = faltantes.length > 0;

  // "Completa" mira solo los datos públicos. `connectBloqueado` incluye el
  // RFC, así que usarlo aquí mantendría el formulario abierto aunque la
  // página pública ya estuviera lista.
  const publicoCompleto = Boolean(
    config?.descripcionPublica && config?.correoContacto && config?.telefonoContacto,
  );
  // Metodos independientes: activar SPEI no apaga la tarjeta ni al reves.
  // El formulario SPEI se colapsa cuando el metodo esta activo Y hay CLABE.
  const speiActivo = Boolean(config?.speiActivo && config?.clabe);
  const mostrarFormularioPublico = editandoPublico || !publicoCompleto;
  const mostrarFormularioSpei = editandoSpei || !speiActivo;

  return (
    <section className="panel animate-in">
      <h4>Cobro de cuotas a los condóminos</h4>
      <p className="helper-text">
        Elige cómo pagan los condóminos. El pago en línea no cambia el flujo de validación: la
        cuota queda pagada automáticamente al confirmarse el cobro, y también puedes seguir
        validando los comprobantes que suban.
      </p>

      {error && <div className="login-error">{error}</div>}
      {aviso && (
        <div className="reminder-box">
          <strong className="reminder-title">{aviso}</strong>
        </div>
      )}

      {/* ---------------- 1. Datos publicos ---------------- */}
      <div className="cobro-metodo">
        <div className="super-block-header">
          <div>
            <h5>Página pública del condominio</h5>
            {mostrarFormularioPublico ? (
              <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
                Stripe revisa esta página para verificar el negocio. Es la que ve un condómino que
                recibe el enlace de invitación, así que debe describir lo que cobras y cómo
                contactarte.
              </p>
            ) : (
              <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
                {config?.correoContacto} · {config?.telefonoContacto}
              </p>
            )}
          </div>
          <div className="btn-row" style={{ margin: 0 }}>
            {publicoCompleto && <span className="status-pill status-activa">Completa</span>}
            {publicoCompleto && !mostrarFormularioPublico && (
              <button
                type="button"
                className="soft-btn compact-btn"
                onClick={() => setEditandoPublico(true)}
              >
                Editar
              </button>
            )}
          </div>
        </div>

        {mostrarFormularioPublico ? (
          <>
            <div className="form-grid">
              <label className="field-label" htmlFor="cobro-descripcion">
                Descripción de los servicios
                <textarea
                  id="cobro-descripcion"
                  rows={3}
                  value={descripcion}
                  onChange={(evento) => setDescripcion(evento.target.value)}
                  placeholder="Ejemplo: administración y cobro de cuotas de mantenimiento. Incluye vigilancia, jardinería y limpieza de áreas comunes."
                  maxLength={600}
                />
                <span className="field-hint">
                  Qué servicios cubre la cuota. Es lo que Stripe lee para confirmar que el negocio
                  es real, y lo que ve quien recibe la invitación.
                </span>
              </label>

              <label className="field-label" htmlFor="cobro-correo-contacto">
                Correo de atención a condóminos
                <input
                  id="cobro-correo-contacto"
                  type="email"
                  value={correoContacto}
                  onChange={(evento) => setCorreoContacto(evento.target.value)}
                  placeholder="contacto@tucondominio.mx"
                  maxLength={150}
                />
              </label>

              <label className="field-label" htmlFor="cobro-telefono-contacto">
                Teléfono de atención a condóminos
                <input
                  id="cobro-telefono-contacto"
                  value={telefonoContacto}
                  onChange={(evento) => setTelefonoContacto(evento.target.value)}
                  placeholder="+52 55 5555 5555"
                  maxLength={30}
                />
              </label>
            </div>

            <p className="field-hint">
              Se publica en{' '}
              <a href={config?.urlPublica ?? '#'} target="_blank" rel="noopener noreferrer">
                {config?.urlPublica ?? '/condominio'}
              </a>
              . No incluye tu dirección ni tus datos personales.
            </p>

            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                disabled={guardando}
                onClick={() => {
                  void (async () => {
                    const ok = await guardar({
                      descripcionPublica: descripcion.trim() || undefined,
                      correoContacto: correoContacto.trim() || undefined,
                      telefonoContacto: telefonoContacto.trim() || undefined,
                    });
                    if (ok) {
                      setEditandoPublico(false);
                    }
                  })();
                }}
              >
                {guardando ? 'Guardando...' : 'Guardar datos públicos'}
              </button>
              {publicoCompleto && (
                <button
                  type="button"
                  className="soft-btn"
                  onClick={() => setEditandoPublico(false)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              )}
            </div>
          </>
        ) : (
          <ul className="datos-lista">
            <li>
              <span>Correo de atención</span>
              <strong>{config?.correoContacto}</strong>
            </li>
            <li>
              <span>Teléfono de atención</span>
              <strong>{config?.telefonoContacto}</strong>
            </li>
            <li>
              <span>Descripción</span>
              <strong>{config?.descripcionPublica}</strong>
            </li>
          </ul>
        )}
      </div>

      {/* ---------------- 2. SPEI ---------------- */}
      <div className="cobro-metodo">
        <div className="super-block-header">
          <div>
            <h5>Transferencia SPEI</h5>
            <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
              El condómino transfiere a tu CLABE con una referencia única. Tú confirmas el pago
              desde la lista de cuotas.
            </p>
          </div>
          <div className="btn-row" style={{ margin: 0 }}>
            {speiActivo && <span className="status-pill status-activa">Activo</span>}
            {speiActivo && !mostrarFormularioSpei && (
              <button
                type="button"
                className="soft-btn compact-btn"
                onClick={() => setEditandoSpei(true)}
              >
                Editar
              </button>
            )}
          </div>
        </div>

        {mostrarFormularioSpei ? (
          <>
        <div className="form-grid">
          <label className="field-label" htmlFor="cobro-clabe">
            CLABE
            <input
              id="cobro-clabe"
              value={clabe}
              onChange={(evento) => setClabe(evento.target.value.replace(/\D/g, '').slice(0, 18))}
              placeholder="18 dígitos"
              inputMode="numeric"
              maxLength={18}
            />
            <span className="field-hint">
              18 dígitos. Se valida el dígito verificador antes de guardar.
            </span>
          </label>

          <label className="field-label" htmlFor="cobro-banco">
            Banco
            <input
              id="cobro-banco"
              value={banco}
              onChange={(evento) => setBanco(evento.target.value)}
              placeholder="BBVA, Banorte..."
              maxLength={80}
            />
          </label>

          <label className="field-label" htmlFor="cobro-beneficiario">
            Beneficiario
            <input
              id="cobro-beneficiario"
              value={beneficiario}
              onChange={(evento) => setBeneficiario(evento.target.value)}
              placeholder="Nombre como aparece en la cuenta"
              maxLength={150}
            />
          </label>

          <label className="field-label" htmlFor="cobro-prefijo">
            Prefijo de referencia (opcional)
            <input
              id="cobro-prefijo"
              value={prefijo}
              onChange={(evento) =>
                setPrefijo(evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))
              }
              placeholder="JAR"
              maxLength={12}
            />
            <span className="field-hint">
              Así empiezan las referencias (ej. <code>JAR-202611-B201</code>). Si lo dejas vacío se
              usan las iniciales del condominio.
            </span>
          </label>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="primary-btn"
            disabled={guardando || clabe.length !== 18}
            onClick={() => {
              void (async () => {
                const ok = await guardar({
                  speiActivo: true,
                  clabe,
                  banco: banco || undefined,
                  beneficiario: beneficiario || undefined,
                  referenciaPrefijo: prefijo || undefined,
                });
                if (ok) {
                  setEditandoSpei(false);
                }
              })();
            }}
          >
            {guardando ? 'Guardando...' : 'Activar transferencia SPEI'}
          </button>
          {speiActivo && (
            <button
              type="button"
              className="soft-btn"
              disabled={guardando}
              onClick={() => {
                void (async () => {
                  const ok = await guardar({ speiActivo: false });
                  if (ok) {
                    setEditandoSpei(false);
                  }
                })();
              }}
            >
              Desactivar SPEI
            </button>
          )}
          {speiActivo && (
            <button
              type="button"
              className="soft-btn"
              disabled={guardando}
              onClick={() => setEditandoSpei(false)}
            >
              Cancelar
            </button>
          )}
        </div>
          </>
        ) : (
          <ul className="datos-lista">
            <li>
              <span>CLABE</span>
              <strong className="mono">{config?.clabe}</strong>
            </li>
            {config?.banco && (
              <li>
                <span>Banco</span>
                <strong>{config.banco}</strong>
              </li>
            )}
            {config?.beneficiario && (
              <li>
                <span>Beneficiario</span>
                <strong>{config.beneficiario}</strong>
              </li>
            )}
            {config?.referenciaPrefijo && (
              <li>
                <span>Prefijo de referencia</span>
                <strong>{config.referenciaPrefijo}</strong>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ---------------- 3. Stripe Connect ---------------- */}
      <div className={`cobro-metodo${connectBloqueado ? ' cobro-metodo-bloqueado' : ''}`}>
        <div className="super-block-header">
          <div>
            <h5>Tarjeta con Stripe</h5>
            <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
              El condómino paga con tarjeta dentro de Elyx. El dinero llega directo a la cuenta
              bancaria del condominio: Elyx nunca lo recibe ni lo retiene.
            </p>
          </div>
          <div className="btn-row" style={{ margin: 0 }}>
            {config?.puedeUsarStripe && <span className="status-pill status-activa">Activo</span>}
            {config?.stripeActivo && !config?.puedeUsarStripe && (
              <span className="status-pill status-pendiente">Verificación pendiente</span>
            )}
          </div>
        </div>

        {/*
          La cuenta es del condominio, no de la persona que la creó. Sin esta
          nota, un administrador nuevo asume que no tiene acceso o que debe
          crear su propia cuenta.
        */}
        <p className="field-hint">
          La cuenta de Stripe pertenece al <strong>condominio</strong>, no a un administrador en
          particular. Cualquier administrador puede completar o actualizar la verificación desde
          Elyx (Stripe no crea un panel por administrador). Cuando haya varios, agrégalos como
          propietarios para que Stripe valide su identidad.
        </p>

        {/* Bloqueo: se explica antes de intentar, con la salida visible. */}
        {connectBloqueado && (
          <div className="reminder-box">
            <strong className="reminder-title">Falta completar la página del condominio</strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {config?.motivoNoConnect ??
                'Stripe revisa la página pública del condominio para verificar el negocio.'}
            </p>
            <ul className="datos-lista" style={{ marginTop: '0.5rem' }}>
              {faltantes.map((campo) => (
                <li key={campo}>
                  <span>{ETIQUETA_REQUISITO[campo] ?? campo}</span>
                  <strong className="status-pill status-pendiente">Pendiente</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!connectBloqueado && connect && (
          <>
            {connect.puedeCobrar ? (
              <p className="muted-text">
                Cuenta <code>{connect.stripeAccountId}</code> verificada. Los cobros con tarjeta
                están habilitados.
              </p>
            ) : (
              <div className="reminder-box">
                <strong className="reminder-title">
                  Falta completar la verificación en Stripe
                </strong>
                <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                  {connect.motivo ?? 'Stripe está revisando la cuenta.'}
                </p>
                {connect.requisitosPendientes.length > 0 && (
                  <ul className="datos-lista" style={{ marginTop: '0.5rem' }}>
                    {connect.requisitosPendientes.slice(0, 5).map((requisito) => (
                      <li key={requisito}>
                        <span className="mono">{requisito}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* El onboarding vive aquí, no en una pestaña de Stripe. */}
            {clientSecret ? (
              <>
                <ConnectOnboarding
                  clientSecret={clientSecret}
                  onRefrescarSecreto={async () => {
                    const { clientSecret: nuevo } =
                      await cobrosApi.crearSesionConnect(idCondominio);
                    return nuevo;
                  }}
                  onSalir={() => {
                    // Al salir se recarga el estado real: Stripe puede haber
                    // habilitado los cobros o pedido más información.
                    setClientSecret(null);
                    void cargar();
                  }}
                />
                <div className="btn-row">
                  <button
                    type="button"
                    className="soft-btn"
                    onClick={() => {
                      setClientSecret(null);
                      void cargar();
                    }}
                  >
                    Ocultar formulario
                  </button>
                </div>
              </>
            ) : (
              <div className="btn-row">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={preparandoOnboarding}
                  onClick={() => void iniciarOnboarding()}
                >
                  {preparandoOnboarding
                    ? 'Preparando...'
                    : connect.puedeCobrar
                      ? 'Actualizar datos en Stripe'
                      : connect.tieneCuenta
                        ? 'Continuar verificación'
                        : 'Verificar mi condominio con Stripe'}
                </button>
              </div>
            )}

            <p className="field-hint">
              La verificación la hace Stripe: te pedirá el RFC del condominio, los datos del
              representante legal y la cuenta bancaria donde recibirás los depósitos. Elyx nunca ve
              esos datos.
            </p>
          </>
        )}

        {/* Costo y MSI: solo cuando ya se puede cobrar. */}
        {!connectBloqueado && connect?.puedeCobrar && config && (
          <div className="cobro-costos">
            <label className="field-label checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(config.stripeActivo)}
                disabled={guardando}
                onChange={(evento) => {
                  const activo = evento.target.checked;
                  void (async () => {
                    const ok = await guardar({ stripeActivo: activo });
                    if (!ok) {
                      // El PATCH fallo (por ejemplo, falta RFC): se relee para
                      // que la casilla no quede mintiendo.
                      await cargar();
                    }
                  })();
                }}
              />
              <span>
                Ofrecer pago con tarjeta a los condóminos
                <span className="field-hint">
                  Puedes tener activos SPEI y tarjeta al mismo tiempo: el condómino elige al
                  pagar. Si lo desactivas, la cuenta de Stripe se conserva y puedes volver a
                  activarlo cuando quieras.
                </span>
              </span>
            </label>

            <p className="helper-text">
              <strong>Comisión de Stripe:</strong> {config.comisionTasa}% +{' '}
              {MONEDA.format(config.comisionFijo)} por transacción (más IVA). Se descuenta del
              depósito del condominio; el condómino paga exactamente el monto de su cuota.
            </p>

            <label className="field-label checkbox-label">
              <input
                type="checkbox"
                checked={permitirMsi}
                onChange={(evento) => {
                  setPermitirMsi(evento.target.checked);
                  void guardar({ permitirMsi: evento.target.checked });
                }}
              />
              <span>
                Permitir meses sin intereses
                <span className="field-hint">
                  Si lo activas, el condómino podrá diferir el pago. Cada plazo agrega{' '}
                  <strong>5% o más</strong> de comisión, que absorbe el condominio: con una cuota de
                  $1,000 a 9 meses recibirías alrededor de $900.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* ---------------- 4. Administradores en Stripe ---------------- */}
      {connect?.tieneCuenta && (
        <div className="cobro-metodo">
          <div className="super-block-header">
            <div>
              <h5>Administradores de la cuenta</h5>
              <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
                La cuenta de Stripe es del condominio. Aquí se registra la identidad de cada
                administrador para que Stripe la tenga en cuenta al verificar la cuenta. Stripe
                puede pedir identificación, dirección y fecha de nacimiento de cada persona.
              </p>
            </div>
            <button
              type="button"
              className="soft-btn compact-btn"
              disabled={sincronizandoAdministradores}
              onClick={() => void sincronizarAdministradores()}
            >
              {sincronizandoAdministradores ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>

          {errorAdministradores && <div className="login-error">{errorAdministradores}</div>}
          {avisoAdministradores && (
            <div className="reminder-box">
              <strong className="reminder-title">{avisoAdministradores}</strong>
            </div>
          )}
          {cargandoAdministradores && !administradores && (
            <p className="muted-text">Consultando administradores en Stripe...</p>
          )}

          {administradores && (
            <>
              <ul className="datos-lista">
                {administradores.administradores.map((admin) => (
                  <li key={admin.idUsuarioCondominio}>
                    <span>
                      {admin.nombre}
                      <br />
                      <small className="muted-text">{admin.correo}</small>
                    </span>
                    <div className="btn-row" style={{ margin: 0 }}>
                      {admin.representante && (
                        <strong className="status-pill status-activa">Representante</strong>
                      )}
                      {!admin.representante && admin.propietario && (
                        <strong className="status-pill status-activa">Propietario</strong>
                      )}
                      {admin.stripePersonId ? (
                        <>
                          {!admin.representante && !admin.propietario && (
                            <strong className="status-pill status-pagada">Registrado</strong>
                          )}
                          <button
                            type="button"
                            className="soft-btn compact-btn"
                            onClick={() =>
                              void quitarAdministrador(admin.stripePersonId!, admin.nombre)
                            }
                          >
                            Quitar de Stripe
                          </button>
                        </>
                      ) : (
                        <strong className="status-pill status-pendiente">Pendiente</strong>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {administradores.administradores.some(
                (admin) =>
                  admin.stripePersonId && !admin.propietario && !admin.representante,
              ) && (
                <p className="field-hint">
                  Stripe no permite asignar propietarios por API después del onboarding. Los
                  administradores marcados como <strong>Registrado</strong> ya tienen su identidad
                  en la cuenta; para que figuren como propietarios, agrégalos desde{' '}
                  <strong>Actualizar datos en Stripe</strong>.
                </p>
              )}

              {administradores.huerfanos.length > 0 && (
                <div className="reminder-box" style={{ marginTop: '0.6rem' }}>
                  <strong className="reminder-title">
                    Personas que ya no son administradoras activas
                  </strong>
                  <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                    Siguen en la cuenta de Stripe. Quítalas cuando ya no deban responder por el
                    condominio; si Stripe las protege, te dirá por qué.
                  </p>
                  <ul className="datos-lista" style={{ marginTop: '0.5rem' }}>
                    {administradores.huerfanos.map((persona) => (
                      <li key={persona.stripePersonId}>
                        <span>
                          {persona.nombre}
                          {persona.correo ? ` · ${persona.correo}` : ''}
                        </span>
                        <button
                          type="button"
                          className="soft-btn compact-btn"
                          onClick={() =>
                            void quitarAdministrador(persona.stripePersonId, persona.nombre)
                          }
                        >
                          Quitar de Stripe
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {administradores.advertencias.length > 0 && (
                <ul className="datos-lista" style={{ marginTop: '0.5rem' }}>
                  {administradores.advertencias.map((advertencia) => (
                    <li key={advertencia}>
                      <span className="muted-text">{advertencia}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {(config?.metodosDisponibles.length ?? 0) === 0 && (
        <p className="muted-text" style={{ marginTop: '0.75rem' }}>
          Mientras no actives ningún método, los condóminos siguen pagando como hasta ahora: suben
          su comprobante y tú lo validas.
        </p>
      )}
    </section>
  );
}
