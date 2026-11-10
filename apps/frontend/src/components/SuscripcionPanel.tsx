import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckoutEmbebido } from './CheckoutEmbebido';
import { DatosFiscalesForm } from './DatosFiscalesForm';
import { registroApi } from '../services/registro.service';
import {
  suscripcionesApi,
  type CobroSuscripcion,
  type DatosFiscales,
  type DesgloseSuscripcion,
  type Suscripcion,
} from '../services/suscripciones.service';

type SuscripcionPanelProps = {
  idCondominio: number;
};

const ETIQUETA_ESTADO: Record<Suscripcion['estado'], string> = {
  PENDIENTE: 'Pendiente de pago',
  ACTIVA: 'Activa',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
};

/** Importe con dos decimales y moneda. */
function dinero(monto: number, moneda: string): string {
  return `$${monto.toFixed(2)} ${moneda}`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Panel del administrador con el estado de su suscripcion a la plataforma.
 *
 * Soporta los tres modos que devuelve el backend:
 *  - `EMBEDDED`: checkout de Stripe montado dentro de la pagina (Link aparece ahi).
 *  - `REDIRECT`: enlace al checkout hospedado.
 *  - `MANUAL`: referencia e instrucciones de transferencia.
 *
 * Con `SUSCRIPCION_ENABLED=false` (self-hosting) explica que no se cobra.
 */
export function SuscripcionPanel({ idCondominio }: SuscripcionPanelProps) {
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [cobro, setCobro] = useState<CobroSuscripcion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  // La propia API informa si esta instancia cobra suscripcion.
  const [cobroHabilitado, setCobroHabilitado] = useState(false);
  const [fiscal, setFiscal] = useState<DatosFiscales | null>(null);
  const [mostrarFiscal, setMostrarFiscal] = useState(false);
  // `true` cuando la pagina se abrio viniendo del checkout de Stripe.
  const [volviendoDeStripe, setVolviendoDeStripe] = useState(false);
  const [verificandoPago, setVerificandoPago] = useState(false);
  const [params, setParams] = useSearchParams();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [config, datos, fiscales] = await Promise.all([
        registroApi.disponibilidad().catch(() => null),
        suscripcionesApi.mia(idCondominio),
        suscripcionesApi.datosFiscales(idCondominio).catch(() => null),
      ]);
      setCobroHabilitado(Boolean(config?.suscripcionRequerida));
      setSuscripcion(datos);
      setFiscal(fiscales);
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible cargar la suscripcion.'));
    } finally {
      setCargando(false);
    }
  }, [idCondominio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Tras pagar, Stripe navega a `/suscripcion?checkout=ok&session_id=...`.
   *
   * El webhook puede tardar unos segundos, asi que se reintenta la consulta
   * hasta que la suscripcion quede ACTIVA. Sin esto el administrador que acaba
   * de pagar veria "Pendiente de pago" y el boton de regenerar cobro, y podria
   * pagar dos veces. La URL se limpia para que recargar no repita el aviso.
   */
  useEffect(() => {
    if (params.get('checkout') !== 'ok') {
      return;
    }

    setVolviendoDeStripe(true);

    const limpio = new URLSearchParams(params);
    limpio.delete('checkout');
    limpio.delete('session_id');
    setParams(limpio, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (!volviendoDeStripe) {
      return;
    }

    let cancelado = false;

    void (async () => {
      setVerificandoPago(true);
      try {
        for (let intento = 0; intento < 6; intento += 1) {
          const datos = await suscripcionesApi.mia(idCondominio).catch(() => null);
          if (cancelado) {
            return;
          }
          if (datos) {
            setSuscripcion(datos);
            if (datos.estado === 'ACTIVA') {
              return;
            }
          }
          await esperar(2000);
        }
      } finally {
        if (!cancelado) {
          setVerificandoPago(false);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [volviendoDeStripe, idCondominio]);

  /**
   * Antes del primer pago se piden los datos fiscales: despues, con clientes
   * activos, migrarlos es mucho mas caro que capturarlos ahora.
   */
  const solicitarCobro = async () => {
    if (cobroHabilitado && fiscal && !fiscal.completo && !mostrarFiscal && !cobro) {
      setMostrarFiscal(true);
      return;
    }

    setTrabajando(true);
    setError(null);
    try {
      setCobro(await suscripcionesApi.crearCobro(idCondominio));
      await cargar();
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible obtener los datos de pago.'));
    } finally {
      setTrabajando(false);
    }
  };

  const abrirPortal = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const { url } = await suscripcionesApi.portal(idCondominio);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible abrir el portal de pagos.'));
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) {
    return (
      <section className="panel">
        <h4>Suscripcion</h4>
        <p className="muted-text">Cargando...</p>
      </section>
    );
  }

  const desglose: DesgloseSuscripcion | null = cobro?.desglose ?? null;
  const esStripe = suscripcion?.proveedor === 'STRIPE';

  return (
    <section className="grid-cards">
      <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
        <h4>Suscripcion a Elyx</h4>

        {error && <div className="login-error">{error}</div>}

        {/* Aviso al volver del checkout. El webhook puede tardar unos segundos,
            asi que el mensaje distingue "confirmando" de "confirmado". */}
        {volviendoDeStripe && (
          <div className="reminder-box">
            <strong className="reminder-title">
              {suscripcion?.estado === 'ACTIVA'
                ? 'Pago confirmado'
                : verificandoPago
                  ? 'Estamos confirmando tu pago'
                  : 'Pago recibido, pendiente de confirmar'}
            </strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {suscripcion?.estado === 'ACTIVA'
                ? 'Tu suscripcion esta activa. Ya puedes generar el enlace de invitacion para tus condominos.'
                : verificandoPago
                  ? 'Stripe esta procesando el cargo. Esto toma unos segundos.'
                  : 'Stripe recibio tu pago pero aun no lo reporta como completado. Se activara automaticamente en cuanto llegue la confirmacion; no necesitas pagar de nuevo.'}
            </p>
          </div>
        )}

        {!cobroHabilitado && (
          <div className="reminder-box">
            <strong className="reminder-title">Esta instalacion no cobra suscripcion</strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              Todas las funciones estan disponibles sin costo ni limite de unidades. Si administras
              esta instancia, la variable que lo controla es <code>SUSCRIPCION_ENABLED</code>.
            </p>
          </div>
        )}

        {cobroHabilitado && !suscripcion && (
          <>
            <p className="muted-text">
              Este condominio aun no tiene una suscripcion registrada. Completa tus datos de
              facturacion y despues realiza el pago.
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void solicitarCobro()}
                disabled={trabajando}
              >
                {trabajando ? 'Preparando...' : 'Continuar al pago'}
              </button>
            </div>
          </>
        )}

        {suscripcion && (
          <>
            <div className="datos-fila">
              <div className="dato">
                <span className="dato-etiqueta">Estado</span>
                <span className={`status-pill status-${suscripcion.estado.toLowerCase()}`}>
                  {ETIQUETA_ESTADO[suscripcion.estado]}
                </span>
              </div>
              <div className="dato">
                <span className="dato-etiqueta">Plan</span>
                <span className="dato-valor">{suscripcion.plan}</span>
              </div>
              <div className="dato">
                <span className="dato-etiqueta">Unidades contratadas</span>
                <span className="dato-valor">
                  {/* Sin cupo (licencia) se muestran las unidades que se facturan. */}
                  {suscripcion.cupoUnidades ?? desglose?.unidades ?? 'Sin limite'}
                </span>
              </div>
              <div className="dato">
                <span className="dato-etiqueta">Monto mensual (neto)</span>
                <span className="dato-valor">
                  {suscripcion.monto > 0
                    ? dinero(suscripcion.monto, suscripcion.moneda)
                    : 'Sin configurar'}
                </span>
              </div>
            </div>

            <ul className="datos-lista">
              <li>
                <span>Proveedor</span>
                <strong>{suscripcion.proveedor}</strong>
              </li>
              <li>
                <span>Periodo</span>
                <strong>{suscripcion.periodo === 'ANUAL' ? 'Anual' : 'Mensual'}</strong>
              </li>
              <li>
                <span>Inicio</span>
                <strong>{suscripcion.fechaInicio ? formatearFecha(suscripcion.fechaInicio) : '—'}</strong>
              </li>
              <li>
                <span>Proximo vencimiento</span>
                <strong>{suscripcion.fechaFin ? formatearFecha(suscripcion.fechaFin) : '—'}</strong>
              </li>
              <li>
                <span>Referencia</span>
                <strong>{suscripcion.referenciaPago ?? 'Sin asignar'}</strong>
              </li>
              <li>
                <span>Total pagado</span>
                <strong>{dinero(suscripcion.totalPagado, suscripcion.moneda)}</strong>
              </li>
            </ul>

            {/* Desglose: base + unidades + IVA. El IVA no es ingreso de Elyx. */}
            {desglose && (
              <div className="datos-tarjeta">
                <span className="dato-etiqueta">Desglose del cobro</span>
                <ul className="desglose-lista">
                  <li>
                    <span>Cuota base</span>
                    <strong>{dinero(desglose.precioBase, desglose.moneda)}</strong>
                  </li>
                  <li>
                    <span>
                      {desglose.unidades} unidad{desglose.unidades === 1 ? '' : 'es'} ×{' '}
                      {dinero(desglose.precioUnidad, desglose.moneda)}
                    </span>
                    <strong>
                      {dinero(desglose.precioUnidad * desglose.unidades, desglose.moneda)}
                    </strong>
                  </li>
                  {/* El piso mensual se cobra como linea aparte para que el
                      desglose sume exactamente lo que cobra la pasarela. */}
                  {desglose.aplicoPiso && (
                    <li>
                      <span>Ajuste a cuota minima</span>
                      <strong>
                        {dinero(
                          desglose.neto -
                            desglose.precioBase -
                            desglose.precioUnidad * desglose.unidades,
                          desglose.moneda,
                        )}
                      </strong>
                    </li>
                  )}
                  <li className="desglose-subtotal">
                    <span>Subtotal (neto)</span>
                    <strong>{dinero(desglose.neto, desglose.moneda)}</strong>
                  </li>
                  <li>
                    <span>IVA {desglose.ivaPorcentaje}%</span>
                    <strong>{dinero(desglose.iva, desglose.moneda)}</strong>
                  </li>
                  <li className="desglose-total">
                    <span>Total a pagar</span>
                    <strong>{dinero(desglose.total, desglose.moneda)}</strong>
                  </li>
                </ul>
              </div>
            )}

            {suscripcion.estado === 'PENDIENTE' && (
              <div className="reminder-box">
                <strong className="reminder-title">Falta confirmar el pago</strong>
                <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                  {suscripcion.instructivo ??
                    'Completa el pago para activar la suscripcion. Una vez confirmado podras invitar condominos.'}
                </p>
                <div className="btn-row" style={{ marginTop: '0.7rem' }}>
                  <button
                    type="button"
                    className="soft-btn"
                    onClick={() => void solicitarCobro()}
                    disabled={trabajando}
                  >
                    {cobro ? 'Regenerar cobro' : 'Ver instrucciones'}
                  </button>
                </div>
              </div>
            )}

            {suscripcion.estado === 'VENCIDA' && (
              <div className="reminder-box">
                <strong className="reminder-title">Pago rechazado</strong>
                <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                  No pudimos procesar el ultimo cargo. Actualiza tu metodo de pago antes de que
                  termine el periodo de gracia; despues el condominio pasa a solo lectura.
                </p>
                {esStripe && (
                  <div className="btn-row" style={{ marginTop: '0.7rem' }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => void abrirPortal()}
                      disabled={trabajando}
                    >
                      Actualizar metodo de pago
                    </button>
                  </div>
                )}
              </div>
            )}

            {suscripcion.estado === 'ACTIVA' && esStripe && (
              <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="soft-btn"
                  onClick={() => void abrirPortal()}
                  disabled={trabajando}
                >
                  Gestionar mi suscripcion
                </button>
              </div>
            )}
          </>
        )}

        {/* Checkout embebido de Stripe: Link aparece dentro del formulario. */}
        {cobro?.modo === 'EMBEDDED' && cobro.clientSecret && (
          <div style={{ marginTop: '1rem' }}>
            <CheckoutEmbebido clientSecret={cobro.clientSecret} />
          </div>
        )}

        {/* Checkout hospedado: se abre en otra pestaña. */}
        {cobro?.modo === 'REDIRECT' && cobro.urlCheckout && (
          <div className="datos-tarjeta">
            <span className="dato-etiqueta">Pago en linea</span>
            <div className="btn-row" style={{ marginTop: '0.6rem' }}>
              <a className="primary-btn" href={cobro.urlCheckout} target="_blank" rel="noreferrer">
                Ir a la pasarela
              </a>
            </div>
          </div>
        )}

        {/* Transferencia: referencia + instrucciones. */}
        {cobro?.modo === 'MANUAL' && (
          <div className="datos-tarjeta">
            <span className="dato-etiqueta">Referencia para tu pago</span>
            <strong className="dato-referencia">{cobro.referencia}</strong>
            <p className="muted-text" style={{ margin: '0.5rem 0 0' }}>
              {cobro.instrucciones}
            </p>
            {desglose && (
              <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                Monto a transferir: {dinero(desglose.total, desglose.moneda)} (IVA incluido)
              </p>
            )}
          </div>
        )}
      </article>

      {/* Datos fiscales: se piden antes del pago y quedan editables despues. */}
      <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
        {mostrarFiscal || !fiscal?.completo ? (
          <DatosFiscalesForm
            idCondominio={idCondominio}
            onGuardado={setFiscal}
            onCompletado={() => {
              setMostrarFiscal(false);
              void cargar();
            }}
          />
        ) : (
          <div className="super-block-header">
            <div>
              <h4>Datos de facturacion</h4>
              <p className="helper-text" style={{ marginTop: '0.25rem' }}>
                {fiscal.razonSocial ?? 'Sin razon social'} — RFC {fiscal.rfc ?? 'sin capturar'}
              </p>
            </div>
            <button
              type="button"
              className="soft-btn compact-btn"
              onClick={() => setMostrarFiscal(true)}
            >
              Editar
            </button>
          </div>
        )}
      </article>
    </section>
  );
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function extraerMensaje(error: unknown, porDefecto: string): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  const inicioJson = mensaje.indexOf('{');
  if (inicioJson >= 0) {
    try {
      const data = JSON.parse(mensaje.slice(inicioJson)) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        return data.message.join(' ');
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
    } catch {
      /* se usa el mensaje crudo */
    }
  }
  return mensaje || porDefecto;
}
