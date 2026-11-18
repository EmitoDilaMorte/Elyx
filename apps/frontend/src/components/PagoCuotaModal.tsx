import { useCallback, useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
import { CheckoutEmbebido } from './CheckoutEmbebido';
import {
  cobrosApi,
  type DatosPagoCuota,
  type MetodoCargo,
  type OpcionesPagoCuota,
} from '../services/cobros.service';

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

const ETIQUETA_METODO: Record<MetodoCargo, string> = {
  SPEI: 'Transferencia SPEI',
  STRIPE: 'Tarjeta',
};

/**
 * Modal para que el condomino pague una cuota.
 *
 * El condominio puede tener SPEI y tarjeta activos AL MISMO TIEMPO. El modal
 * primero muestra que opciones hay y crea el cargo hasta que el condomino elige:
 * solo se permite un cargo PENDIENTE por cuota, asi que crearlo al abrir
 * bloquearia el otro metodo.
 *
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
  const [opciones, setOpciones] = useState<OpcionesPagoCuota | null>(null);
  /** Metodo elegido por el condomino (o el del cargo ya en proceso). */
  const [seleccionado, setSeleccionado] = useState<MetodoCargo | null>(null);
  const [datos, setDatos] = useState<DatosPagoCuota | null>(null);
  const [cargando, setCargando] = useState(true);
  /** Se esta creando el cargo del metodo elegido. */
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  /** El iframe aviso que el pago termino y se esta esperando al webhook. */
  const [confirmando, setConfirmando] = useState(false);
  /** Mensaje del enlace de auxilio "¿Ya pagaste?". */
  const [mensaje, setMensaje] = useState<string | null>(null);

  /**
   * Carga las opciones. Es de solo lectura: no crea ningun cargo.
   * Si ya hay un cargo vigente, el modal abre directo en ese metodo para no
   * perder la referencia SPEI que el condomino pudo haber copiado.
   */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setOpciones(await cobrosApi.opcionesPagoCuota(idCondominio, idCuota));
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudieron obtener las opciones de pago.'));
    } finally {
      setCargando(false);
    }
  }, [idCondominio, idCuota]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Crea el cargo del metodo elegido.
   *
   * Si el condomino cambia de opinion, el backend reutiliza la fila PENDIENTE
   * y la pasa al otro metodo: no quedan dos cobros vivos de la misma cuota.
   */
  const elegir = useCallback(
    async (metodo: MetodoCargo) => {
      setSeleccionado(metodo);
      setPreparando(true);
      setDatos(null);
      setError(null);
      setMensaje(null);
      setConfirmando(false);
      try {
        setDatos(await cobrosApi.crearCargo(idCondominio, idCuota, metodo));
      } catch (err) {
        setError(extraerMensaje(err, 'No se pudo iniciar el pago con ese metodo.'));
      } finally {
        setPreparando(false);
      }
    },
    [idCondominio, idCuota],
  );

  // Preseleccion: el metodo que ya esta en proceso o, si solo hay uno
  // disponible, ese. Con dos opciones y sin cargo se espera a que elija.
  useEffect(() => {
    if (!opciones || seleccionado) {
      return;
    }
    const inicial =
      opciones.metodoEnProceso ??
      (opciones.metodosDisponibles.length === 1 ? opciones.metodosDisponibles[0] : null);
    if (inicial) {
      void elegir(inicial);
    }
  }, [elegir, opciones, seleccionado]);

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

        {cargando && <p className="muted-text">Cargando opciones de pago...</p>}
        {error && <div className="login-error">{error}</div>}

        {/* Sin ningun metodo activo: se explica y se ofrece el comprobante. */}
        {opciones?.motivo && (
          <div className="reminder-box">
            <strong className="reminder-title">Pago en linea no disponible</strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {opciones.motivo}
            </p>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              Puedes subir tu comprobante desde la lista de cuotas y el administrador lo validara.
            </p>
          </div>
        )}

        {/*
          Selector de metodo. Solo aparece cuando hay mas de uno: con un solo
          metodo se preselecciona solo y se muestra directo.
        */}
        {opciones && opciones.metodosDisponibles.length > 1 && (
          <div style={{ marginBottom: '0.9rem' }}>
            <p className="helper-text" style={{ margin: '0 0 0.45rem' }}>
              Elige como quieres pagar. Puedes cambiar de opcion antes de completar el pago.
            </p>
            <div className="btn-row">
              {opciones.metodosDisponibles.map((metodo) => (
                <button
                  key={metodo}
                  type="button"
                  className={seleccionado === metodo ? 'primary-btn' : 'soft-btn'}
                  disabled={preparando}
                  onClick={() => void elegir(metodo)}
                >
                  {ETIQUETA_METODO[metodo]}
                </button>
              ))}
            </div>
          </div>
        )}

        {preparando && (
          <p className="muted-text">
            Preparando {seleccionado ? ETIQUETA_METODO[seleccionado].toLowerCase() : 'el pago'}...
          </p>
        )}

        {/* El metodo elegido no se pudo preparar (cuenta sin verificar, etc.). */}
        {datos?.motivo && !opciones?.motivo && (
          <div className="reminder-box">
            <strong className="reminder-title">Ese metodo no esta disponible</strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {datos.motivo}
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

            {/* Se avisa en la app, no solo dentro del iframe: la tarjeta se
                guarda EN STRIPE (cuenta del condominio) y solo para pagos en
                los que el condomino este presente. */}
            {datos.tarjetaGuardada && (
              <p className="muted-text" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                Tus tarjetas guardadas aparecen al inicio del formulario. Si pagas con una
                nueva, tambien se guardara para la proxima.
              </p>
            )}
            {!datos.tarjetaGuardada && datos.guardarTarjeta && (
              <p className="muted-text" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                Tu tarjeta se guardara de forma segura en Stripe para tus proximos pagos.
                Solo se usa cuando tu la eliges: no se hacen cobros automaticos.
              </p>
            )}

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