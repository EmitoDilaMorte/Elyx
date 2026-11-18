import { useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
import { backendApi, type MetaPaginacion, type PagoPaginado } from '../services/backendApi.service';
import { cobrosApi, type CargoPendiente } from '../services/cobros.service';
import { BarraFiltrosLista, type OpcionLista } from './BarraFiltrosLista';
import { PaginacionLista } from './PaginacionLista';
import { useListaParametros } from './useListaParametros';

type EvidenciaPago = {
  idEvidencia: number;
  idPago: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
};

type ValidacionesListaProps = {
  idCondominio: number;
  nombrePorMembresia: Record<number, string>;
  evidenciasPorPago: Record<number, EvidenciaPago[]>;
  formatShortDate: (isoDate: string) => string;
  /**
   * Contador que fuerza la recarga del listado paginado.
   *
   * Se pagina en el servidor, asi que actualizar `appData` al aprobar o
   * rechazar no cambia las tarjetas: hay que pedir otra consulta.
   */
  refrescoPagos?: number;
  onAprobarPago: (idPago: number) => void;
  onRechazarPago: (idPago: number) => void;
  onGenerarReciboPago: (idPago: number) => void;
};

/** Los valores enviados al backend son los del enum PagoEstado. */
const ESTADOS: OpcionLista[] = [
  { value: 'CAPTURADO', label: 'Pendiente' },
  { value: 'VALIDADO', label: 'Aprobado' },
  { value: 'RECHAZADO', label: 'Rechazado' },
];

/** Canales por los que puede entrar un pago. */
const ORIGENES: OpcionLista[] = [
  { value: 'SPEI', label: 'Transferencia' },
  { value: 'STRIPE', label: 'Tarjeta' },
  { value: 'COMPROBANTE', label: 'Manual' },
];

const ORDENES: OpcionLista[] = [
  { value: 'reciente', label: 'Más reciente' },
  { value: 'antiguo', label: 'Más antiguo' },
  { value: 'monto_desc', label: 'Monto: mayor a menor' },
  { value: 'monto_asc', label: 'Monto: menor a mayor' },
];

const MONEDA = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

const ETIQUETA_ESTADO: Record<PagoPaginado['estadoBackend'], string> = {
  CAPTURADO: 'Pendiente',
  VALIDADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

/** Etiqueta del canal de pago, para distinguirlos dentro de una sola lista. */
const ETIQUETA_ORIGEN: Record<PagoPaginado['origen'], string> = {
  SPEI: 'Transferencia',
  STRIPE: 'Tarjeta',
  COMPROBANTE: 'Manual',
};

/**
 * Vista de "Validacion de pagos" del administrador.
 *
 * Es **una sola lista**: transferencias por conciliar y pagos ya registrados
 * conviven en el mismo lugar, distinguidos por una etiqueta de origen. Antes
 * habia dos bloques separados ("Transferencias SPEI por conciliar" arriba y
 * "pagos" abajo) y el administrador veia el mismo movimiento dos veces: la
 * referencia pendiente y el pago que el condomino habia registrado.
 *
 * El filtro **Origen** (Transferencia / Tarjeta / Manual) se aplica en el
 * servidor sobre `pagos.origen`, y ademas oculta las transferencias sin
 * conciliar cuando no incluye `SPEI`.
 */
export function ValidacionesLista({
  idCondominio,
  nombrePorMembresia,
  evidenciasPorPago,
  formatShortDate,
  refrescoPagos = 0,
  onAprobarPago,
  onRechazarPago,
  onGenerarReciboPago,
}: ValidacionesListaProps) {
  const {
    page,
    q,
    orden,
    estados,
    claveEstados,
    origenes,
    claveOrigenes,
    version,
    aplicarCambios,
    urlPagina,
    irPagina,
    marcarCarga,
  } = useListaParametros();

  const [items, setItems] = useState<PagoPaginado[]>([]);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Transferencias SPEI pendientes de conciliar ---
  const [cargos, setCargos] = useState<CargoPendiente[]>([]);
  const [errorCargos, setErrorCargos] = useState<string | null>(null);
  const [avisoSpei, setAvisoSpei] = useState<string | null>(null);
  const [cargoPorConfirmar, setCargoPorConfirmar] = useState<number | null>(null);
  const [confirmandoCargo, setConfirmandoCargo] = useState(false);
  // Confirmar una transferencia crea un pago VALIDADO que debe aparecer en la
  // lista de abajo sin esperar a que el administrador cambie de pagina.
  const [recargaPagos, setRecargaPagos] = useState(0);

  useEffect(() => {
    if (!idCondominio) {
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError(null);

    backendApi
      .listPagosPaginado({
        idCondominio,
        page,
        pageSize: 12,
        q,
        estados,
        origenes: origenes as PagoPaginado['origen'][],
        orden,
      })
      .then((data) => {
        if (!cancelado) {
          setItems(data.items);
          setMeta(data.meta);
          marcarCarga();
        }
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los pagos.');
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCondominio, page, q, claveEstados, claveOrigenes, orden, recargaPagos, refrescoPagos]);

  /**
   * Carga las transferencias SPEI pendientes.
   *
   * Se refresca cada 20 s porque un condomino puede generar su referencia
   * mientras el administrador tiene la vista abierta. Es una peticion ligera y
   * el ciclo de sondeo del panel (10 peticiones cada 15 s) deja margen dentro
   * del limite global de 60/min.
   */
  useEffect(() => {
    if (!idCondominio) {
      return;
    }

    let cancelado = false;

    const cargarCargos = async () => {
      try {
        const datos = await cobrosApi.cargosPendientes(idCondominio);
        if (!cancelado) {
          setCargos(datos);
          setErrorCargos(null);
        }
      } catch (err) {
        if (!cancelado) {
          // Un fallo aqui no debe impedir validar comprobantes: la lista de
          // pagos de abajo sigue siendo utilizable.
          setErrorCargos(
            extraerMensaje(err, 'No se pudieron cargar las transferencias SPEI pendientes.'),
          );
        }
      }
    };

    void cargarCargos();
    const temporizador = window.setInterval(() => void cargarCargos(), 20_000);

    return () => {
      cancelado = true;
      window.clearInterval(temporizador);
    };
    // `refrescoPagos` tambien recarga las transferencias: aprobar un pago
    // cancela su cargo pendiente en el backend, y el panel debe reflejarlo sin
    // esperar al sondeo de 20 s.
  }, [idCondominio, refrescoPagos]);

  const confirmarSpei = async (cargo: CargoPendiente) => {
    setConfirmandoCargo(true);
    setErrorCargos(null);
    setAvisoSpei(null);
    try {
      await cobrosApi.confirmarCargoSpei(idCondominio, cargo.idCargo);
      setCargos((prev) => prev.filter((item) => item.idCargo !== cargo.idCargo));
      setAvisoSpei(
        `Transferencia confirmada: ${cargo.periodo} · unidad ${cargo.claveUnidad} por ${MONEDA.format(
          cargo.montoTotal,
        )}.`,
      );
      setCargoPorConfirmar(null);
      setRecargaPagos((valor) => valor + 1);
    } catch (err) {
      setErrorCargos(extraerMensaje(err, 'No se pudo confirmar la transferencia.'));
    } finally {
      setConfirmandoCargo(false);
    }
  };

  // El aviso de conciliacion se retira solo: dejarlo fijo confunde cuando el
  // administrador vuelve mas tarde y ya no hay nada pendiente.
  useEffect(() => {
    if (!avisoSpei) {
      return;
    }
    const temporizador = window.setTimeout(() => setAvisoSpei(null), 6000);
    return () => window.clearTimeout(temporizador);
  }, [avisoSpei]);

  const alternarEstado = (valor: string, activo: boolean) => {
    const nuevos = activo
      ? [...estados.filter((estado) => estado !== valor), valor]
      : estados.filter((estado) => estado !== valor);
    aplicarCambios({ estado: nuevos });
  };

  const alternarOrigen = (valor: string, activo: boolean) => {
    const nuevos = activo
      ? [...origenes.filter((origen) => origen !== valor), valor]
      : origenes.filter((origen) => origen !== valor);
    aplicarCambios({ origen: nuevos });
  };

  // Una transferencia sin conciliar solo tiene sentido cuando el filtro no
  // excluye SPEI: si el administrador esta viendo "solo tarjeta", mostrarlas
  // seria ruido.
  const mostrarPendientes =
    cargos.length > 0 && (origenes.length === 0 || origenes.includes('SPEI'));
  const listaVacia = !cargando && !mostrarPendientes && items.length === 0 && !error;

  return (
    <section className="panel animate-in">
      <h4>Validacion de pagos</h4>
      <p className="helper-text">
        Todo en una sola lista: confirma las transferencias que ya llegaron a tu cuenta y valida
        los comprobantes que subieron los condominos. Cada movimiento indica su origen.
      </p>

      {avisoSpei && (
        <div className="reminder-box">
          <strong className="reminder-title">{avisoSpei}</strong>
        </div>
      )}
      {errorCargos && <p className="login-error">{errorCargos}</p>}

      <BarraFiltrosLista
        idPrefijo="pagos"
        q={q}
        estados={estados}
        orden={orden}
        origenes={origenes}
        opcionesEstado={ESTADOS}
        opcionesOrigen={ORIGENES}
        opcionesOrden={ORDENES}
        placeholderBusqueda="Buscar por periodo, unidad o referencia"
        onBuscar={(valor) => aplicarCambios({ q: valor || null })}
        onAlternarEstado={alternarEstado}
        onAlternarOrigen={alternarOrigen}
        onCambiarOrden={(valor) => aplicarCambios({ orden: valor })}
      />

      {error && <p className="login-error">{error}</p>}

      <div className="payment-list" style={{ marginTop: '0.85rem' }}>
        {/* Transferencias que el condomino ya genero y que aun no se reflejan
            en el estado de cuenta. No son pagos: son referencias esperando el
            deposito, por eso se marcan como tales dentro de la misma lista. */}
        {mostrarPendientes && (
          <>
            <p className="helper-text" style={{ margin: '0 0 0.4rem' }}>
              <strong>Transferencias por conciliar</strong> — confirmalas cuando el deposito
              aparezca en tu estado de cuenta. La cuota queda pagada y el condomino recibe el
              aviso.
            </p>
            {cargos.map((cargo) => (
              <article className="payment-item cuota-card" key={`cargo-${cargo.idCargo}`}>
                <div>
                  <h3 className="item-title" style={{ margin: 0 }}>
                    {cargo.periodo} — Unidad {cargo.claveUnidad}
                  </h3>
                  <p className="helper-text" style={{ margin: '0.2rem 0' }}>
                    Referencia:{' '}
                    <code className="mono">{cargo.referenciaSpei ?? 'sin referencia'}</code>
                  </p>
                  <small>{textoVigencia(cargo.expiraEn)}</small>
                </div>
                <p className="item-amount">{MONEDA.format(cargo.montoTotal)}</p>
                <span className="status-pill status-pendiente">Transferencia pendiente</span>
                <div className="btn-row">
                  {cargoPorConfirmar === cargo.idCargo ? (
                    <>
                      <button
                        className="primary-btn"
                        disabled={confirmandoCargo}
                        onClick={() => void confirmarSpei(cargo)}
                      >
                        {confirmandoCargo ? 'Confirmando...' : 'Si, ya lo recibi'}
                      </button>
                      <button
                        className="soft-btn"
                        disabled={confirmandoCargo}
                        onClick={() => setCargoPorConfirmar(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      className="soft-btn"
                      onClick={() => {
                        setCargoPorConfirmar(cargo.idCargo);
                        setAvisoSpei(null);
                      }}
                    >
                      Confirmar transferencia
                    </button>
                  )}
                </div>
              </article>
            ))}
          </>
        )}

        {cargando && <p className="helper-text">Cargando pagos...</p>}
        {listaVacia && (
          <p className="empty-state">No hay pagos que coincidan con la busqueda.</p>
        )}

        {items.map((pago) => {
          const evidencias = evidenciasPorPago[pago.idPago] ?? [];
          const nombreCondomino = nombrePorMembresia[pago.idUsuarioCondominioPaga];

          return (
            <article className="payment-item cuota-card" key={`${pago.idPago}-${version}`}>
              <div>
                <h3 className="item-title" style={{ margin: 0 }}>
                  <a href={`#pago-${pago.idPago}`}>
                    Pago #{pago.idPago} — {pago.tipo}
                  </a>
                </h3>
                <p className="helper-text" style={{ margin: '0.2rem 0' }}>
                  {pago.periodo}
                  {nombreCondomino ? ` · Condomino: ${nombreCondomino}` : ''}
                  {pago.claveUnidad ? ` · Unidad: ${pago.claveUnidad}` : ''}
                  {` · Origen: ${ETIQUETA_ORIGEN[pago.origen]}`}
                  {pago.referencia ? ` · Ref: ${pago.referencia}` : ''}
                </p>
                <small>
                  Fecha:{' '}
                  <time dateTime={pago.fechaPago.slice(0, 10)} title={formatShortDate(pago.fechaPago)}>
                    {pago.fechaPago.slice(0, 10)}
                  </time>
                </small>
              </div>
              <p className="item-amount">{MONEDA.format(pago.monto)}</p>
              <span
                className={`status-pill ${
                  pago.estadoBackend === 'VALIDADO'
                    ? 'status-pagada'
                    : pago.estadoBackend === 'RECHAZADO'
                      ? 'status-vencida'
                      : 'status-pendiente'
                }`}
              >
                {ETIQUETA_ESTADO[pago.estadoBackend]}
              </span>
              <div style={{ marginBottom: '0.55rem' }}>
                <p className="helper-text" style={{ margin: '0 0 0.3rem' }}>
                  Comprobantes: {evidencias.length}
                </p>
                {evidencias.length > 0 && (
                  <ul className="clean-list" style={{ marginBottom: '0.3rem' }}>
                    {evidencias.slice(0, 3).map((evidencia) => (
                      <li key={evidencia.idEvidencia}>
                        <a href={evidencia.urlArchivo} target="_blank" rel="noopener noreferrer">
                          {evidencia.nombreArchivo}
                        </a>
                        <small>{formatShortDate(evidencia.fechaCarga)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {pago.motivoRechazo && (
                <p className="helper-text" style={{ margin: '0 0 0.4rem' }}>
                  Motivo del rechazo: {pago.motivoRechazo}
                </p>
              )}
              <div className="btn-row">
                <button
                  className="primary-btn"
                  onClick={() => onAprobarPago(pago.idPago)}
                  disabled={pago.status !== 'PENDIENTE'}
                >
                  Aprobar pago
                </button>
                <button
                  className="soft-btn"
                  onClick={() => onRechazarPago(pago.idPago)}
                  disabled={pago.status !== 'PENDIENTE'}
                >
                  Rechazar pago
                </button>
                <button className="soft-btn" onClick={() => onGenerarReciboPago(pago.idPago)}>
                  Generar recibo
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <PaginacionLista
        meta={meta}
        urlPagina={urlPagina}
        irPagina={irPagina}
        etiquetaResumen="pago(s)"
        ariaLabel="Paginacion de pagos"
      />
    </section>
  );
}

/** "Vence en 12 dias" / "Vencido": la urgencia se lee sin calcular fechas. */
function textoVigencia(expiraEn: string | null): string {
  if (!expiraEn) {
    return 'Sin vigencia';
  }

  const dias = Math.ceil((new Date(expiraEn).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) {
    return 'Referencia vencida';
  }
  if (dias === 0) {
    return 'Vence hoy';
  }
  return `Referencia vigente ${dias} ${dias === 1 ? 'dia' : 'dias'} mas`;
}
