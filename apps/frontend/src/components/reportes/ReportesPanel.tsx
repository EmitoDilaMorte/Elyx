import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { backendApi } from '../../services/backendApi.service';
import { extraerMensaje } from '../../lib/errores';
import type { ReporteFinancieroResumen } from '../../types/reportes';
import {
  GraficaAntiguedad,
  GraficaCategorias,
  GraficaMetodos,
  GraficaTendencia,
  GraficaTopDeudores,
} from './ReporteGraficas';
import {
  TablaCategorias,
  TablaCobranza,
  TablaMetodos,
  TablaPeriodos,
  TarjetaMiUnidad,
} from './ReporteTablas';
import { formatearPeriodo, moneda, porcentaje } from '../../lib/reportes/formato';
import { exportarReporteExcel } from '../../lib/reportes/exportarExcel';
import { exportarReportePdf } from '../../lib/reportes/exportarPdf';

type ReportesPanelProps = {
  idCondominio: number;
  /** El administrador ve cartera, deudores y comisiones. */
  esAdmin: boolean;
  /** Cambia cuando se registra, aprueba o rechaza un pago. */
  refrescoPagos: number;
  /** Oculta el titulo cuando se embebe dentro de "Gastos y reportes". */
  embebido?: boolean;
  onRunAction: (loading: string, success: string) => void;
};

/**
 * Panel de reportes financieros, compartido por administrador y condomino.
 *
 * Todo el dinero se calcula en el servidor: aqui solo se formatea. La unica
 * diferencia entre roles la aplica el backend (comisiones, cartera por unidad y
 * deudores son solo del administrador), asi que este componente no decide que
 * esconder: si un campo no viene, no se muestra.
 *
 * La seleccion de periodos se envia al servidor con debounce: cambiar de chip
 * no debe disparar una peticion por clic ni dejar que una respuesta vieja
 * sobrescriba a la nueva (se descarta por numero de peticion).
 */
export function ReportesPanel({
  idCondominio,
  esAdmin,
  refrescoPagos,
  embebido = false,
  onRunAction,
}: ReportesPanelProps) {
  const [datos, setDatos] = useState<ReporteFinancieroResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  /** Vacio = todos los periodos. */
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);
  const peticionRef = useRef(0);

  const claveSeleccion = useMemo(
    () => [...seleccion].sort().join(','),
    [seleccion],
  );

  useEffect(() => {
    if (!idCondominio) {
      return;
    }

    let cancelado = false;
    const peticion = ++peticionRef.current;
    const periodosPedidos = claveSeleccion ? claveSeleccion.split(',') : [];

    setCargando(true);
    setError(null);

    // 300 ms de debounce solo cuando hay filtro: sin filtro la carga es directa.
    const espera = periodosPedidos.length > 0 ? 300 : 0;
    const temporizador = window.setTimeout(() => {
      backendApi
        .getReporteFinancieroResumen(idCondominio, periodosPedidos)
        .then((respuesta) => {
          // Una respuesta lenta de una seleccion anterior no debe pisar la nueva.
          if (!cancelado && peticion === peticionRef.current) {
            setDatos(respuesta);
          }
        })
        .catch((err: unknown) => {
          if (!cancelado && peticion === peticionRef.current) {
            setError(extraerMensaje(err, 'No se pudo cargar el reporte financiero.'));
          }
        })
        .finally(() => {
          if (!cancelado && peticion === peticionRef.current) {
            setCargando(false);
          }
        });
    }, espera);

    return () => {
      cancelado = true;
      window.clearTimeout(temporizador);
    };
  }, [idCondominio, claveSeleccion, version, refrescoPagos]);

  // Si un periodo seleccionado desaparece (se purgo un gasto o cambio el
  // condominio), se descarta para no dejar chips muertos.
  useEffect(() => {
    if (!datos || seleccion.length === 0) {
      return;
    }
    const disponibles = new Set(datos.periodosDisponibles);
    const vigentes = seleccion.filter((periodo) => disponibles.has(periodo));
    if (vigentes.length !== seleccion.length) {
      setSeleccion(vigentes);
    }
  }, [datos, seleccion]);

  const alternarPeriodo = (periodo: string) => {
    setSeleccion((prev) =>
      prev.includes(periodo)
        ? prev.filter((item) => item !== periodo)
        : [...prev, periodo],
    );
  };

  const seleccionarUltimos = (cantidad: number) => {
    const disponibles = datos?.periodosDisponibles ?? [];
    setSeleccion(disponibles.slice(0, cantidad));
  };

  const seleccionarAnioActual = () => {
    const anio = String(new Date().getFullYear());
    setSeleccion(
      (datos?.periodosDisponibles ?? []).filter((periodo) => periodo.startsWith(anio)),
    );
  };

  const actualizar = useCallback(() => {
    setVersion((valor) => valor + 1);
  }, []);

  const descargar = async (tipo: 'pdf' | 'excel') => {
    if (!datos) {
      return;
    }
    setMensaje(null);
    setExportando(tipo);
    try {
      if (tipo === 'pdf') {
        await exportarReportePdf(datos);
        onRunAction('Generando PDF...', 'Reporte PDF descargado');
      } else {
        await exportarReporteExcel(datos);
        onRunAction('Generando Excel...', 'Reporte Excel descargado');
      }
    } catch (err) {
      console.error(err);
      setMensaje('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setExportando(null);
    }
  };

  const periodoTexto = datos
    ? datos.periodos.length === 0
      ? 'Sin periodos'
      : datos.periodos.length === 1
        ? formatearPeriodo(datos.periodos[0])
        : `${formatearPeriodo(datos.periodos[datos.periodos.length - 1])} — ${formatearPeriodo(datos.periodos[0])}`
    : '';

  return (
    <section className="reportes-panel">
      <header className="reporte-encabezado">
        <div>
          {!embebido && <h4>Reportes financieros</h4>}
          {embebido && <h4>Reportes financieros</h4>}
          <p className="helper-text" style={{ margin: '0.2rem 0 0' }}>
            {datos
              ? `${datos.condominio.nombre} · ${periodoTexto} · ${datos.periodos.length} de ${datos.periodosDisponibles.length} periodos`
              : 'Cargando movimientos del condominio...'}
          </p>
        </div>
        <div className="btn-row reporte-acciones">
          <button
            type="button"
            className="soft-btn"
            onClick={actualizar}
            disabled={cargando}
          >
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="soft-btn"
            onClick={() => void descargar('pdf')}
            disabled={!datos || cargando || exportando !== null}
          >
            <Icon name="download" />
            {exportando === 'pdf' ? 'Generando...' : 'PDF'}
          </button>
          <button
            type="button"
            className="soft-btn"
            onClick={() => void descargar('excel')}
            disabled={!datos || cargando || exportando !== null}
          >
            <Icon name="download" />
            {exportando === 'excel' ? 'Generando...' : 'Excel'}
          </button>
        </div>
      </header>

      {mensaje && <div className="login-error">{mensaje}</div>}

      {/* Selector de periodos. Vacio = todos, que es lo que ve el usuario al
          entrar y lo que exporta el PDF/Excel si no filtra. */}
      {datos && datos.periodosDisponibles.length > 0 && (
        <div className="reporte-periodos">
          <div className="reporte-periodos-atajos">
            <button
              type="button"
              className={`reporte-chip ${seleccion.length === 0 ? 'activo' : ''}`}
              aria-pressed={seleccion.length === 0}
              onClick={() => setSeleccion([])}
            >
              Todos
            </button>
            <button
              type="button"
              className="reporte-chip"
              onClick={() => seleccionarUltimos(6)}
            >
              Ultimos 6
            </button>
            <button
              type="button"
              className="reporte-chip"
              onClick={seleccionarAnioActual}
            >
              Este año
            </button>
          </div>
          <div className="reporte-periodos-lista">
            {datos.periodosDisponibles.map((periodo) => {
              const activo = seleccion.includes(periodo);
              return (
                <button
                  key={periodo}
                  type="button"
                  className={`reporte-chip ${activo ? 'activo' : ''}`}
                  aria-pressed={activo}
                  onClick={() => alternarPeriodo(periodo)}
                >
                  {formatearPeriodo(periodo)}
                </button>
              );
            })}
          </div>
          <p className="helper-text">
            Mostrando {datos.periodos.length} de {datos.periodosDisponibles.length} periodos.
            {seleccion.length === 0
              ? ' Sin seleccion se incluyen todos.'
              : ' Toca un periodo para quitarlo o agregarlo.'}
          </p>
        </div>
      )}

      {error && (
        <div className="reporte-error">
          <p>{error}</p>
          <button type="button" className="soft-btn" onClick={actualizar}>
            Reintentar
          </button>
        </div>
      )}

      {!error && cargando && !datos && (
        <p className="empty-state">Calculando reporte...</p>
      )}

      {datos && datos.seriePeriodos.length === 0 && (
        <p className="empty-state">
          No hay movimientos en los periodos seleccionados.
        </p>
      )}

      {datos && datos.seriePeriodos.length > 0 && (
        <>
          <div className="reporte-kpis">
            <article className="reporte-kpi">
              <span>Facturado</span>
              <strong>{moneda(datos.kpis.facturado)}</strong>
              <small>Cuotas emitidas en el rango</small>
            </article>
            <article className="reporte-kpi">
              <span>Cobrado (capital)</span>
              <strong>{moneda(datos.kpis.cobradoCapital)}</strong>
              <small>Sin recargos</small>
            </article>
            <article className="reporte-kpi">
              <span>Recargos cobrados</span>
              <strong>{moneda(datos.kpis.recargosCobrados)}</strong>
              <small>Por atraso en el pago</small>
            </article>
            <article className="reporte-kpi reporte-kpi-tasa">
              <span>Tasa de cobranza</span>
              <strong>{porcentaje(datos.kpis.tasaCobranza)}</strong>
              <div
                className="reporte-progreso"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(datos.kpis.tasaCobranza * 100)}
              >
                <span
                  style={{
                    width: `${Math.min(100, Math.max(0, datos.kpis.tasaCobranza * 100))}%`,
                  }}
                />
              </div>
              <small>Cobrado sobre facturado</small>
            </article>
            <article className="reporte-kpi">
              <span>Gastos</span>
              <strong>{moneda(datos.kpis.gastos)}</strong>
              <small>{datos.seriePeriodos.reduce((s, p) => s + p.gastosRegistrados, 0)} movimientos</small>
            </article>
            {esAdmin && (
              <article className="reporte-kpi">
                <span>Comisiones de Stripe</span>
                <strong>{moneda(datos.kpis.comisiones)}</strong>
                <small>Descontadas del deposito</small>
              </article>
            )}
            <article
              className={`reporte-kpi ${datos.kpis.balanceNeto < 0 ? 'reporte-kpi-negativo' : 'reporte-kpi-positivo'}`}
            >
              <span>Balance neto</span>
              <strong>{moneda(datos.kpis.balanceNeto)}</strong>
              <small>
                {esAdmin ? 'Ingresos - gastos - comisiones' : 'Ingresos - gastos'}
              </small>
            </article>
            <article className="reporte-kpi reporte-kpi-alerta">
              <span>Adeudo total</span>
              <strong>{moneda(datos.kpis.adeudoTotal)}</strong>
              <small>
                {moneda(datos.kpis.adeudoCapital)} capital +{' '}
                {moneda(datos.kpis.recargosEstimados)} recargos
              </small>
            </article>
            <article className="reporte-kpi">
              <span>{esAdmin ? 'Unidades con adeudo' : 'Cuotas pendientes'}</span>
              <strong>
                {esAdmin
                  ? `${datos.kpis.unidadesConAdeudo} de ${datos.kpis.unidadesActivas}`
                  : datos.kpis.cuotasPendientes}
              </strong>
              <small>{esAdmin ? 'Unidades activas' : 'En los periodos elegidos'}</small>
            </article>
          </div>

          <article className="reporte-bloque">
            <div className="reporte-bloque-encabezado">
              <h5>Tendencia de ingresos y gastos</h5>
              {datos.seriePeriodos.length > 12 && (
                <small className="muted-text">Ultimos 12 periodos</small>
              )}
            </div>
            <GraficaTendencia datos={datos.seriePeriodos} />
          </article>

          <div className="reporte-chart-grid">
            <article className="reporte-bloque">
              <h5>Gastos por categoria</h5>
              <GraficaCategorias datos={datos.gastosPorCategoria} />
              <TablaCategorias filas={datos.gastosPorCategoria} />
            </article>
            <article className="reporte-bloque">
              <h5>Metodos de pago</h5>
              <GraficaMetodos datos={datos.metodosPago} />
              <TablaMetodos filas={datos.metodosPago} />
            </article>
          </div>

          <article className="reporte-bloque">
            <h5>Detalle por periodo</h5>
            <TablaPeriodos filas={datos.seriePeriodos} esAdmin={esAdmin} />
          </article>

          {esAdmin ? (
            <>
              <div className="reporte-chart-grid">
                <article className="reporte-bloque">
                  <h5>Antiguedad de adeudos</h5>
                  <GraficaAntiguedad datos={datos.antiguedadAdeudos} />
                </article>
                <article className="reporte-bloque">
                  <h5>Unidades con mayor adeudo</h5>
                  <p className="helper-text">
                    Las 10 unidades con mayor adeudo, en orden de unidad.
                  </p>
                  <GraficaTopDeudores datos={datos.topDeudores ?? []} />
                </article>
              </div>
              <article className="reporte-bloque">
                <h5>Cobranza por unidad</h5>
                <p className="helper-text">
                  Cobrado y adeudo por unidad en los periodos seleccionados. Incluye recargos
                  devengados. Primero aparecen las unidades con adeudo y despues las que estan al
                  corriente; dentro de cada grupo, en orden de unidad.
                </p>
                <TablaCobranza filas={datos.cobranzaPorUnidad ?? []} />
              </article>
            </>
          ) : (
            <article className="reporte-bloque">
              <TarjetaMiUnidad datos={datos.miUnidad ?? null} />
            </article>
          )}
        </>
      )}
    </section>
  );
}
