import { useCallback, useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
import { CheckoutEmbebido } from './CheckoutEmbebido';
import { cobrosApi, type DatosPagoCuota } from '../services/cobros.service';

type PagoCuotaModalProps = {
  idCondominio: number;
  idCuota: number;
  periodo: string;
  monto: number;
  /** Se invoca cuando el pago ya se confirmo, para refrescar la lista. */
  onPagado?: () => void;
  onCerrar: () => void;
};

const MONEDA = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

/**
 * Modal para que el condomino pague una cuota.
 *
 * Muestra lo que corresponda segun el metodo que configuro el administrador:
 *  - SPEI: CLABE, referencia y monto, con boton de copiar.
 *  - Tarjeta: checkout de Stripe embebido.
 *
 * **El condomino ve solo el monto de su cuota.** La comision de Stripe la
 * absorbe el condominio y se muestra en el panel del administrador, no aqui:
 * cobrarla al residente seria aumentar la cuota sin que el administrador lo
 * haya decidido.
 */
export function PagoCuotaModal({
  idCondominio,
  idCuota,
  periodo,
  monto,
  onPagado,
  onCerrar,
}: PagoCuotaModalProps) {
  const [datos, setDatos] = useState<DatosPagoCuota | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  /** El iframe aviso que el pago termino y se esta esperando al webhook. */
  const [confirmando, setConfirmando] = useState(false);
  /** Mensaje del enlace de auxilio "¿Ya pagaste?". */
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await cobrosApi.datosPagoCuota(idCondominio, idCuota));
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudieron obtener los datos de pago.'));
    } finally {
      setCargando(false);
    }
  }, [idCondominio, idCuota]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Se ejecuta cuando el iframe de Stripe confirma el pago.
   *
   * `onComplete` significa que la SESION termino, no que Elyx ya lo sepa: la
   * cuota la marca pagada el webhook de Connect, que puede tardar un momento.
   * Por eso se consulta el estado hasta que la base lo refleje, en lugar de
   * cerrar el modal con una suposicion.
   */
  const confirmarPago = useCallback(async () => {
    setConfirmando(true);
    setMensaje(null);

    for (let intento = 0; intento < 6; intento += 1) {
      try {
        const estado = await cobrosApi.estadoCargoCuota(idCondominio, idCuota);
        if (estado.estadoCuota === 'PAGADA' || estado.estadoCargo === 'PAGADO') {
          setConfirmando(false);
          onPagado?.();
          return;
        }
      } catch {
        // Se reintenta: el webhook del backend es la fuente de verdad y puede
        // llegar unos segundos despues que la confirmacion visual de Stripe.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    setConfirmando(false);
    setMensaje(
      'Stripe recibio el pago y lo esta confirmando. La cuota se marcara pagada sola en unos segundos.',
    );
  }, [idCondominio, idCuota, onPagado]);

  /**
   * Consulta puntual para quien ya pago y no vio el cambio.
   *
   * A diferencia del boton anterior, NO vuelve a pedir los datos de pago: eso
   * devolvia `clientSecret: null` y destruia el formulario de Stripe.
   */
  const verificarPago = async () => {
    setMensaje(null);
    try {
      const estado = await cobrosApi.estadoCargoCuota(idCondominio, idCuota);
      if (estado.estadoCuota === 'PAGADA' || estado.estadoCargo === 'PAGADO') {
        onPagado?.();
        return;
      }
      setMensaje(
        estado.estadoCargo === 'PENDIENTE' || estado.estadoCargo === null
          ? 'Todavia no aparece el pago. Si tu banco ya lo aprobo, puede tardar unos segundos mas.'
          : 'Este cobro ya no esta activo. Cierra esta ventana y vuelve a abrir el pago para generar uno nuevo.',
      );
    } catch (err) {
      setMensaje(extraerMensaje(err, 'No se pudo consultar el estado del pago.'));
    }
  };

  const copiar = async (texto: string, etiqueta: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(etiqueta);
      window.setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles el usuario puede copiar a mano: los datos
      // estan visibles y son seleccionables.
      setCopiado(null);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Pagar cuota">
      <div className="modal-card pago-cuota-modal">
        <header className="modal-header">
          <div>
            <h4>Pagar cuota {periodo}</h4>
            <p className="muted-text" style={{ margin: '0.2rem 0 0' }}>
              Monto a pagar: <strong>{MONEDA.format(monto)}</strong>
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        {cargando && <p className="muted-text">Cargando datos de pago...</p>}
        {error && <div className="login-error">{error}</div>}

        {/* Sin metodo configurado o cuenta sin verificar: se explica y se sale. */}
        {datos?.motivo && (
          <div className="reminder-box">
            <strong className="reminder-title">Pago en linea no disponible</strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {datos.motivo}
            </p>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              Puedes subir tu comprobante desde la lista de cuotas y el administrador lo validara.
            </p>
          </div>
        )}

        {/* --- SPEI --- */}
        {datos?.metodo === 'SPEI' && datos.referencia && !datos.motivo && (
          <div className="datos-pago">
            <p className="helper-text">
              Transfiere el monto exacto con la referencia indicada. El administrador confirmara
              tu pago cuando lo vea en el estado de cuenta del condominio.
            </p>

            <ul className="datos-lista">
              <li>
                <span>CLABE</span>
                <strong className="mono">{datos.clabe}</strong>
              </li>
              {datos.banco && (
                <li>
                  <span>Banco</span>
                  <strong>{datos.banco}</strong>
                </li>
              )}
              {datos.beneficiario && (
                <li>
                  <span>Beneficiario</span>
                  <strong>{datos.beneficiario}</strong>
                </li>
              )}
              <li>
                <span>Referencia</span>
                <strong className="mono">{datos.referencia}</strong>
              </li>
              <li>
                <span>Monto</span>
                <strong>{MONEDA.format(datos.montoTotal)}</strong>
              </li>
            </ul>

            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void copiar(datos.clabe ?? '', 'clabe')}
              >
                {copiado === 'clabe' ? 'CLABE copiada' : 'Copiar CLABE'}
              </button>
              <button
                type="button"
                className="soft-btn"
                onClick={() => void copiar(datos.referencia ?? '', 'referencia')}
              >
                {copiado === 'referencia' ? 'Referencia copiada' : 'Copiar referencia'}
              </button>
            </div>

            <p className="muted-text" style={{ marginTop: '0.75rem' }}>
              La referencia es unica para esta cuota: no la reutilices para otra.
            </p>
          </div>
        )}

        {/* --- Tarjeta --- */}
        {datos?.metodo === 'STRIPE' && datos.clientSecret && !datos.motivo && (
          <div>
            <p className="helper-text">
              El pago se procesa en el momento y la cuota queda marcada como pagada.
            </p>

            {confirmando && (
              <div className="reminder-box">
                <strong className="reminder-title">Confirmando tu pago...</strong>
                <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
                  Stripe ya recibio el cobro. Estamos esperando la confirmacion del banco.
                </p>
              </div>
            )}

            {/* El iframe se oculta mientras se confirma: si el usuario siguiera
                interactuando podria iniciar un segundo cobro de la misma cuota. */}
            <div style={{ display: confirmando ? 'none' : undefined }}>
              <CheckoutEmbebido clientSecret={datos.clientSecret} onCompletado={() => void confirmarPago()} />
            </div>

            {mensaje && <p className="helper-text">{mensaje}</p>}

            {/* Enlace de auxilio, no un boton de accion principal: el pago se
                actualiza solo. Sirve para quien cerro el iframe habiendo pagado. */}
            <p className="muted-text" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              ¿Ya pagaste y sigue apareciendo pendiente?{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => void verificarPago()}
              >
                Consultar el estado
              </button>
            </p>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button type="button" className="soft-btn" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}