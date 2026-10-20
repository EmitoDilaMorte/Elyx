import { useEffect, useState } from 'react';
import { backendApi, type CuotaPaginada, type MetaPaginacion } from '../services/backendApi.service';
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

type PagoDeCuota = {
  id: number;
  status: string;
};

type PagosListaCondominoProps = {
  idCondominio: number;
  idUsuarioCondominio: number | null;
  pagoPorCuota: Record<number, PagoDeCuota>;
  evidenciasPorPago: Record<number, EvidenciaPago[]>;
  formatShortDate: (isoDate: string) => string;
  onRegistrarPago: (cuotaId: number) => void;
  onSubirComprobante: (cuotaId: number, file: File) => void;
  onDescargarReciboCuota: (cuotaId: number) => void;
  onEliminarEvidenciaPago: (idEvidencia: number) => void;
};

const ESTADOS: OpcionLista[] = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'EN_VALIDACION', label: 'En validacion' },
  { value: 'PAGADA', label: 'Pagada' },
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

function etiquetaEstado(estado: CuotaPaginada['estado']): string {
  if (estado === 'PAGADA') return 'Pagada';
  if (estado === 'EN_VALIDACION') return 'En validacion';
  return 'Pendiente';
}

/**
 * Vista de "Pagos" del condomino: sus cuotas con busqueda, filtro, orden y
 * paginacion en servidor. Conserva las acciones de pago de cada tarjeta.
 */
export function PagosListaCondomino({
  idCondominio,
  idUsuarioCondominio,
  pagoPorCuota,
  evidenciasPorPago,
  formatShortDate,
  onRegistrarPago,
  onSubirComprobante,
  onDescargarReciboCuota,
  onEliminarEvidenciaPago,
}: PagosListaCondominoProps) {
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

  const [items, setItems] = useState<CuotaPaginada[]>([]);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Sin membresia activa no se consulta: pedir el listado sin filtrar
    // mostraria las cuotas de otras unidades del condominio.
    if (!idCondominio || !idUsuarioCondominio) {
      setItems([]);
      setMeta(null);
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError(null);

    backendApi
      .listCuotasPaginado({
        idCondominio,
        idUsuarioCondominio,
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
          setError(err instanceof Error ? err.message : 'No se pudieron cargar las cuotas.');
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
  }, [idCondominio, idUsuarioCondominio, page, q, claveEstados, orden]);

  const alternarEstado = (valor: string, activo: boolean) => {
    const nuevos = activo
      ? [...estados.filter((estado) => estado !== valor), valor]
      : estados.filter((estado) => estado !== valor);
    aplicarCambios({ estado: nuevos });
  };

  return (
    <section className="panel animate-in">
      <h4>Pagos y cuotas</h4>
      <p className="helper-text">Busca, filtra y ordena tus cuotas para registrar pagos.</p>

      <BarraFiltrosLista
        idPrefijo="cuotas"
        q={q}
        estados={estados}
        orden={orden}
        opcionesEstado={ESTADOS}
        opcionesOrden={ORDENES}
        placeholderBusqueda="Buscar por periodo, tipo o unidad"
        onBuscar={(valor) => aplicarCambios({ q: valor || null })}
        onAlternarEstado={alternarEstado}
        onCambiarOrden={(valor) => aplicarCambios({ orden: valor })}
      />

      {error && <p className="login-error">{error}</p>}

      <div className="payment-list" style={{ marginTop: '0.85rem' }}>
        {!idUsuarioCondominio && (
          <p className="helper-text">Selecciona un condominio donde tengas una membresia activa.</p>
        )}
        {cargando && <p className="helper-text">Cargando cuotas...</p>}
        {!cargando && items.length === 0 && !error && (
          <p className="empty-state">No hay cuotas que coincidan con la busqueda.</p>
        )}

        {items.map((cuota) => {
          const pago = pagoPorCuota[cuota.idCuota];
          const evidencias = pago ? (evidenciasPorPago[pago.id] ?? []) : [];

          return (
            <article className="payment-item cuota-card" key={`${cuota.idCuota}-${version}`}>
              <div>
                <h3 className="item-title" style={{ margin: 0 }}>
                  <a href={`#cuota-${cuota.idCuota}`}>{cuota.periodo}</a>
                </h3>
                <p className="helper-text" style={{ margin: '0.2rem 0' }}>
                  {cuota.tipo}
                  {cuota.claveUnidad ? ` · Unidad ${cuota.claveUnidad}` : ''}
                </p>
                <small>
                  Limite:{' '}
                  <time dateTime={cuota.fechaLimite} title={formatShortDate(cuota.fechaLimite)}>
                    {cuota.fechaLimite}
                  </time>
                  {cuota.recargo > 0 ? ` | Recargo: ${MONEDA.format(cuota.recargo)}` : ''}
                </small>
              </div>
              <p className="item-amount">{MONEDA.format(cuota.monto)}</p>
              <span
                className={`status-pill ${cuota.estado === 'PAGADA' ? 'status-pagada' : 'status-pendiente'}`}
              >
                {etiquetaEstado(cuota.estado)}
              </span>
              <div className="btn-row">
                <button
                  className="primary-btn"
                  onClick={() => onRegistrarPago(cuota.idCuota)}
                  disabled={cuota.estado !== 'PENDIENTE'}
                >
                  Registrar pago
                </button>
                <label
                  className="soft-btn"
                  htmlFor={`comprobante-${cuota.idCuota}`}
                  style={{ cursor: 'pointer' }}
                >
                  Subir comprobante
                </label>
                <input
                  id={`comprobante-${cuota.idCuota}`}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(evento) => {
                    const file = evento.target.files?.[0];
                    if (file) {
                      onSubirComprobante(cuota.idCuota, file);
                    }
                    evento.currentTarget.value = '';
                  }}
                />
                <button className="soft-btn" onClick={() => onDescargarReciboCuota(cuota.idCuota)}>
                  Descargar recibo
                </button>
              </div>
              {evidencias.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <p className="helper-text" style={{ margin: '0 0 0.3rem' }}>
                    Comprobantes: {evidencias.length}
                  </p>
                  <ul className="clean-list">
                    {evidencias.map((evidencia) => (
                      <li
                        key={evidencia.idEvidencia}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}
                      >
                        <a href={evidencia.urlArchivo} target="_blank" rel="noopener noreferrer">
                          {evidencia.nombreArchivo}
                        </a>
                        <small>{formatShortDate(evidencia.fechaCarga)}</small>
                        {pago && pago.status === 'PENDIENTE' && (
                          <button
                            className="soft-btn"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => onEliminarEvidenciaPago(evidencia.idEvidencia)}
                          >
                            Eliminar
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <PaginacionLista
        meta={meta}
        urlPagina={urlPagina}
        irPagina={irPagina}
        etiquetaResumen="cuota(s)"
        ariaLabel="Paginacion de cuotas"
      />
    </section>
  );
}
