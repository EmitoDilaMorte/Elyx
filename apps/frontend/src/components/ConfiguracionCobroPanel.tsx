import { useCallback, useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
import { ConnectOnboarding } from './ConnectOnboarding';
import {
  cobrosApi,
  type ConfiguracionCobro,
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

  // Formulario SPEI
  const [clabe, setClabe] = useState('');
  const [banco, setBanco] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [prefijo, setPrefijo] = useState('');
  const [permitirMsi, setPermitirMsi] = useState(false);

  // Onboarding embebido
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparandoOnboarding, setPreparandoOnboarding] = useState(false);

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
      setConnect(await cobrosApi.estadoConnect(idCondominio).catch(() => null));
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo cargar la configuración de cobro.'));
    } finally {
      setCargando(false);
    }
  }, [idCondominio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (cambios: Parameters<typeof cobrosApi.actualizarConfiguracion>[1]) => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const datos = await cobrosApi.actualizarConfiguracion(idCondominio, cambios);
      setConfig(datos);
      setAviso('Configuración guardada.');
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo guardar la configuración.'));
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
            <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
              Stripe revisa esta página para verificar el negocio. Es la que ve un condómino que
              recibe el enlace de invitación, así que debe describir lo que cobras y cómo
              contactarte.
            </p>
          </div>
          {!connectBloqueado && <span className="status-pill status-activa">Completa</span>}
        </div>

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
              Qué servicios cubre la cuota. Es lo que Stripe lee para confirmar que el negocio es
              real, y lo que ve quien recibe la invitación.
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
            onClick={() =>
              void guardar({
                descripcionPublica: descripcion.trim() || undefined,
                correoContacto: correoContacto.trim() || undefined,
                telefonoContacto: telefonoContacto.trim() || undefined,
              })
            }
          >
            {guardando ? 'Guardando...' : 'Guardar datos públicos'}
          </button>
        </div>
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
          {config?.metodo === 'SPEI' && <span className="status-pill status-activa">Activo</span>}
        </div>

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
            onClick={() =>
              void guardar({
                metodo: 'SPEI',
                clabe,
                banco: banco || undefined,
                beneficiario: beneficiario || undefined,
                referenciaPrefijo: prefijo || undefined,
              })
            }
          >
            {guardando ? 'Guardando...' : 'Activar transferencia SPEI'}
          </button>
        </div>
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
          {connect?.puedeCobrar && <span className="status-pill status-activa">Activo</span>}
        </div>

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

      {config?.metodo === 'NINGUNO' && (
        <p className="muted-text" style={{ marginTop: '0.75rem' }}>
          Mientras no actives ningún método, los condóminos siguen pagando como hasta ahora: suben
          su comprobante y tú lo validas.
        </p>
      )}
    </section>
  );
}
