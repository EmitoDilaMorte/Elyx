import { useCallback, useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
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

/**
 * Configuracion de como cobra el condominio sus cuotas.
 *
 * Dos metodos, con requisitos distintos:
 *  - **SPEI**: solo necesita una CLABE. Funciona para todos los condominios,
 *    incluidos los que no tienen RFC.
 *  - **Tarjeta (Stripe Connect)**: Stripe exige el RFC del condominio para
 *    verificar la cuenta y poder depositarle. Si falta, la opcion aparece
 *    **deshabilitada con el motivo a la vista** y un enlace para capturarlo:
 *    se explica antes de intentar, no se deja que Stripe rechace.
 *
 * La comision de Stripe la absorbe el condominio (se descuenta de su deposito).
 * Aqui se muestra cuanto es, porque el administrador debe saberlo antes de
 * activar el cobro con tarjeta.
 */
export function ConfiguracionCobroPanel({ idCondominio }: ConfiguracionCobroPanelProps) {
  const [config, setConfig] = useState<ConfiguracionCobro | null>(null);
  const [connect, setConnect] = useState<EstadoConnect | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Formulario SPEI
  const [clabe, setClabe] = useState('');
  const [banco, setBanco] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [prefijo, setPrefijo] = useState('');
  const [permitirMsi, setPermitirMsi] = useState(false);

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

      // El estado de Connect se consulta aparte: si falla, la configuracion de
      // SPEI sigue siendo utilizable.
      setConnect(await cobrosApi.estadoConnect(idCondominio).catch(() => null));
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo cargar la configuracion de cobro.'));
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
      setAviso('Configuracion guardada.');
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo guardar la configuracion.'));
    } finally {
      setGuardando(false);
    }
  };

  const conectarStripe = async () => {
    setGuardando(true);
    setError(null);
    try {
      const { url } = await cobrosApi.crearEnlaceConnect(idCondominio);
      // El onboarding lo hospeda Stripe: recoge RFC, cuenta bancaria e
      // identificacion. Elyx nunca ve esos datos.
      window.location.href = url;
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo iniciar la conexion con Stripe.'));
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <section className="panel animate-in">
        <h4>Cobro de cuotas a los condominos</h4>
        <p className="muted-text">Cargando...</p>
      </section>
    );
  }

  const connectBloqueado = config ? !config.puedeUsarConnect : true;

  return (
    <section className="panel animate-in">
      <h4>Cobro de cuotas a los condominos</h4>
      <p className="helper-text">
        Elige como pagan los condominos. El pago en linea no cambia el flujo de validacion: la
        cuota queda pagada automaticamente al confirmarse el cobro, y tambien puedes seguir
        validando los comprobantes que suban.
      </p>

      {error && <div className="login-error">{error}</div>}
      {aviso && <div className="reminder-box"><strong className="reminder-title">{aviso}</strong></div>}

      {/* ---------------- SPEI ---------------- */}
      <div className="cobro-metodo">
        <div className="super-block-header">
          <div>
            <h5>Transferencia SPEI</h5>
            <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
              El condomino transfiere a tu CLABE con una referencia unica. Tu confirmas el pago
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
              onChange={(e) => setClabe(e.target.value.replace(/\D/g, '').slice(0, 18))}
              placeholder="18 digitos"
              inputMode="numeric"
              maxLength={18}
            />
            <span className="field-hint">
              18 digitos. Se valida el digito verificador antes de guardar.
            </span>
          </label>

          <label className="field-label" htmlFor="cobro-banco">
            Banco
            <input
              id="cobro-banco"
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              placeholder="BBVA, Banorte..."
              maxLength={80}
            />
          </label>

          <label className="field-label" htmlFor="cobro-beneficiario">
            Beneficiario
            <input
              id="cobro-beneficiario"
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
              placeholder="Nombre como aparece en la cuenta"
              maxLength={150}
            />
          </label>

          <label className="field-label" htmlFor="cobro-prefijo">
            Prefijo de referencia (opcional)
            <input
              id="cobro-prefijo"
              value={prefijo}
              onChange={(e) => setPrefijo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
              placeholder="JAR"
              maxLength={12}
            />
            <span className="field-hint">
              Asi empezaran las referencias (ej. <code>JAR-202611-B201</code>). Si lo dejas vacio se
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

      {/* ---------------- Stripe Connect ---------------- */}
      <div className={`cobro-metodo${connectBloqueado ? ' cobro-metodo-bloqueado' : ''}`}>
        <div className="super-block-header">
          <div>
            <h5>Tarjeta con Stripe</h5>
            <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
              El condomino paga con tarjeta dentro de Elyx. El dinero llega directo a la cuenta
              bancaria del condominio: Elyx nunca lo recibe ni lo retiene.
            </p>
          </div>
          {connect?.puedeCobrar && <span className="status-pill status-activa">Activo</span>}
        </div>

        {/* Bloqueo por RFC: se explica antes de intentar, con la salida visible. */}
        {connectBloqueado && (
          <div className="reminder-box">
            <strong className="reminder-title">Necesitas registrar el RFC del condominio</strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {config?.motivoNoConnect ??
                'Stripe exige el RFC para verificar la cuenta y poder depositarle.'}
            </p>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              Capturalo en <strong>Datos de facturacion</strong>, en esta misma pagina, y vuelve
              aqui. Mientras tanto, la transferencia SPEI ya funciona sin RFC.
            </p>
          </div>
        )}

        {!connectBloqueado && connect && (
          <>
            {connect.puedeCobrar ? (
              <p className="muted-text">
                Cuenta <code>{connect.stripeAccountId}</code> verificada. Los cobros con tarjeta
                estan habilitados.
              </p>
            ) : (
              <div className="reminder-box">
                <strong className="reminder-title">Falta completar la verificacion en Stripe</strong>
                <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                  {connect.motivo ?? 'Stripe esta revisando la cuenta.'}
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

            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                disabled={guardando}
                onClick={() => void conectarStripe()}
              >
                {connect.puedeCobrar
                  ? 'Actualizar datos en Stripe'
                  : connect.tieneCuenta
                    ? 'Continuar verificacion en Stripe'
                    : 'Conectar mi cuenta de Stripe'}
              </button>
            </div>
          </>
        )}

        {/* Costo y MSI: solo cuando ya se puede cobrar. */}
        {!connectBloqueado && connect?.puedeCobrar && config && (
          <div className="cobro-costos">
            <p className="helper-text">
              <strong>Comision de Stripe:</strong> {config.comisionTasa}% +{' '}
              {MONEDA.format(config.comisionFijo)} por transaccion (mas IVA). Se descuenta del
              deposito del condominio; el condomino paga exactamente el monto de su cuota.
            </p>

            <label className="field-label checkbox-label">
              <input
                type="checkbox"
                checked={permitirMsi}
                onChange={(e) => {
                  setPermitirMsi(e.target.checked);
                  void guardar({ permitirMsi: e.target.checked });
                }}
              />
              <span>
                Permitir meses sin intereses
                <span className="field-hint">
                  Si lo activas, el condomino podra diferir el pago. Cada plazo agrega{' '}
                  <strong>5% o mas</strong> de comision, que absorbe el condominio: con una cuota de
                  $1,000 a 9 meses recibirias alrededor de $900.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      {config?.metodo === 'NINGUNO' && (
        <p className="muted-text" style={{ marginTop: '0.75rem' }}>
          Mientras no actives ningun metodo, los condominos siguen pagando como hasta ahora:
          suben su comprobante y tu lo validas.
        </p>
      )}
    </section>
  );
}