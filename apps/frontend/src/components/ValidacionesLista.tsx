import { useEffect, useState } from 'react';
import { backendApi, type MetaPaginacion, type PagoPaginado } from '../services/backendApi.service';
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

/**
 * Vista de "Validacion de pagos" del administrador: pagos del condominio con
 * busqueda, filtro, orden y paginacion en servidor.
 */
export function ValidacionesLista({
  idCondominio,
  nombrePorMembresia,
  evidenciasPorPago,
  formatShortDate,
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
  }, [idCondominio, page, q, claveEstados, orden]);

  const alternarEstado = (valor: string, activo: boolean) => {
    const nuevos = activo
      ? [...estados.filter((estado) => estado !== valor), valor]
      : estados.filter((estado) => estado !== valor);
    aplicarCambios({ estado: nuevos });
  };

  return (
    <section className="panel animate-in">
      <h4>Validacion de pagos</h4>
      <p className="helper-text">Busca por periodo, unidad o referencia y ordena los pagos del condominio.</p>

      <BarraFiltrosLista
        idPrefijo="pagos"
        q={q}
        estados={estados}
        orden={orden}
        opcionesEstado={ESTADOS}
        opcionesOrden={ORDENES}
        placeholderBusqueda="Buscar por periodo, unidad o referencia"
        onBuscar={(valor) => aplicarCambios({ q: valor || null })}
        onAlternarEstado={alternarEstado}
        onCambiarOrden={(valor) => aplicarCambios({ orden: valor })}
      />

      {error && <p className="login-error">{error}</p>}

      <div className="payment-list" style={{ marginTop: '0.85rem' }}>
        {cargando && <p className="helper-text">Cargando pagos...</p>}
        {!cargando && items.length === 0 && !error && (
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
