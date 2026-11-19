import type {
  CategoriaGastoReporte,
  CobranzaUnidadReporte,
  MetodoPagoReporte,
  MiUnidadReporte,
  PeriodoFinanciero,
} from '../../types/reportes';
import {
  ETIQUETA_ESTADO_COBRANZA,
  ETIQUETA_ORIGEN,
  formatearPeriodo,
  moneda,
  porcentaje,
  porcentajeDirecto,
} from '../../lib/reportes/formato';

/**
 * Tablas del reporte.
 *
 * Las graficas resumen; las tablas son la fuente exacta. Se mantienen separadas
 * del panel para que las exportaciones PDF/Excel puedan reutilizar los mismos
 * tipos y etiquetas.
 */

export function TablaPeriodos({
  filas,
  esAdmin,
}: {
  filas: PeriodoFinanciero[];
  esAdmin: boolean;
}) {
  if (filas.length === 0) {
    return <p className="empty-state">No hay periodos con movimientos.</p>;
  }

  return (
    <div className="table-wrap reporte-tabla">
      <table>
        <thead>
          <tr>
            <th>Periodo</th>
            <th className="num">Facturado</th>
            <th className="num">Cobrado</th>
            <th className="num">Recargos cobrados</th>
            <th className="num">Tasa</th>
            <th className="num">Gastos</th>
            {esAdmin && <th className="num">Comisiones</th>}
            <th className="num">Balance</th>
            <th className="num">Adeudo capital</th>
            <th className="num">Recargos devengados</th>
            <th className="num">Adeudo total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.periodo}>
              <td>{formatearPeriodo(fila.periodo)}</td>
              <td className="num">{moneda(fila.facturado)}</td>
              <td className="num">{moneda(fila.cobradoCapital)}</td>
              <td className="num">{moneda(fila.recargosCobrados)}</td>
              <td className="num">{porcentaje(fila.tasaCobranza)}</td>
              <td className="num">{moneda(fila.gastos)}</td>
              {esAdmin && <td className="num">{moneda(fila.comisiones)}</td>}
              <td className={`num ${fila.balanceNeto < 0 ? 'negativo' : 'positivo'}`}>
                {moneda(fila.balanceNeto)}
              </td>
              <td className="num">{moneda(fila.adeudoCapital)}</td>
              <td className="num">{moneda(fila.recargosEstimados)}</td>
              <td className="num">{moneda(fila.adeudoTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablaCategorias({ filas }: { filas: CategoriaGastoReporte[] }) {
  if (filas.length === 0) {
    return <p className="empty-state">Aun no hay gastos en el rango.</p>;
  }

  return (
    <div className="table-wrap reporte-tabla">
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th className="num">Movimientos</th>
            <th className="num">Monto</th>
            <th className="num">% del gasto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.categoria}>
              <td>{fila.categoria}</td>
              <td className="num">{fila.movimientos}</td>
              <td className="num">{moneda(fila.monto)}</td>
              <td className="num">{porcentajeDirecto(fila.porcentaje)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablaMetodos({ filas }: { filas: MetodoPagoReporte[] }) {
  if (filas.length === 0) {
    return <p className="empty-state">Aun no hay pagos validados en el rango.</p>;
  }

  return (
    <div className="table-wrap reporte-tabla">
      <table>
        <thead>
          <tr>
            <th>Metodo</th>
            <th className="num">Pagos</th>
            <th className="num">Monto</th>
            <th className="num">Recargos</th>
            <th className="num">% cobrado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.origen}>
              <td>{ETIQUETA_ORIGEN[fila.origen] ?? fila.origen}</td>
              <td className="num">{fila.pagos}</td>
              <td className="num">{moneda(fila.monto)}</td>
              <td className="num">{moneda(fila.recargos)}</td>
              <td className="num">{porcentajeDirecto(fila.porcentaje)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablaCobranza({ filas }: { filas: CobranzaUnidadReporte[] }) {
  if (filas.length === 0) {
    return <p className="empty-state">No hay unidades con cuotas en el rango.</p>;
  }

  return (
    <div className="table-wrap reporte-tabla">
      <table>
        <thead>
          <tr>
            <th>Unidad</th>
            <th>Ocupante</th>
            <th className="num">Facturado</th>
            <th className="num">Cobrado</th>
            <th className="num">Adeudo capital</th>
            <th className="num">Recargos</th>
            <th className="num">Adeudo total</th>
            <th className="num">Atraso</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.idUnidad}>
              {/* La clave no se parte: "Depto 1" en dos lineas parece "Depto"
                  y "1" en filas distintas y estorba al buscar la unidad. */}
              <td className="unidad">{fila.claveUnidad}</td>
              <td>{fila.ocupante ?? 'Sin ocupante'}</td>
              <td className="num">{moneda(fila.facturado)}</td>
              <td className="num">{moneda(fila.cobradoCapital)}</td>
              <td className="num">{moneda(fila.adeudoCapital)}</td>
              <td className="num">{moneda(fila.recargosEstimados)}</td>
              <td className="num">{moneda(fila.adeudoTotal)}</td>
              <td className="num">
                {fila.diasAtrasoMax > 0 ? `${fila.diasAtrasoMax} dias` : '—'}
              </td>
              <td>
                <span
                  className={`status-pill reporte-estado reporte-estado-${fila.estado.toLowerCase()}`}
                >
                  {ETIQUETA_ESTADO_COBRANZA[fila.estado] ?? fila.estado}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Resumen de las unidades del condomino autenticado. */
export function TarjetaMiUnidad({ datos }: { datos: MiUnidadReporte | null }) {
  if (!datos) {
    return (
      <div className="reporte-mi-unidad">
        <h5>Tu unidad</h5>
        <p className="empty-state">
          No tienes una unidad asociada en este condominio.
        </p>
      </div>
    );
  }

  return (
    <div className="reporte-mi-unidad">
      <div className="reporte-mi-unidad-encabezado">
        <div>
          <h5>Tu unidad</h5>
          <p className="helper-text">{datos.clavesUnidad.join(', ') || 'Sin unidad'}</p>
        </div>
        <span
          className={`status-pill reporte-estado reporte-estado-${datos.estado.toLowerCase()}`}
        >
          {ETIQUETA_ESTADO_COBRANZA[datos.estado] ?? datos.estado}
        </span>
      </div>
      <ul className="datos-lista">
        <li>
          <span>Facturado en el rango</span>
          <strong>{moneda(datos.facturado)}</strong>
        </li>
        <li>
          <span>Pagado (capital)</span>
          <strong>{moneda(datos.cobradoCapital)}</strong>
        </li>
        <li>
          <span>Recargos pagados</span>
          <strong>{moneda(datos.recargosCobrados)}</strong>
        </li>
        <li>
          <span>Adeudo capital</span>
          <strong>{moneda(datos.adeudoCapital)}</strong>
        </li>
        <li>
          <span>Recargos devengados</span>
          <strong>{moneda(datos.recargosEstimados)}</strong>
        </li>
        <li>
          <span>Adeudo total</span>
          <strong>{moneda(datos.adeudoTotal)}</strong>
        </li>
        <li>
          <span>Cuotas pendientes</span>
          <strong>
            {datos.cuotasPendientes} de {datos.cuotas}
          </strong>
        </li>
        <li>
          <span>Atraso maximo</span>
          <strong>{datos.diasAtrasoMax > 0 ? `${datos.diasAtrasoMax} dias` : 'Sin atraso'}</strong>
        </li>
      </ul>
    </div>
  );
}
