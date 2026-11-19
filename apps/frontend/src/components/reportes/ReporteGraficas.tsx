import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AntiguedadReporte,
  CategoriaGastoReporte,
  CobranzaUnidadReporte,
  MetodoPagoReporte,
  PeriodoFinanciero,
} from '../../types/reportes';
import {
  ETIQUETA_ORIGEN,
  formatearPeriodoCorto,
  moneda,
  monedaCompacta,
} from '../../lib/reportes/formato';

/**
 * Graficas del reporte financiero.
 *
 * Recharts necesita colores concretos; se usan los mismos de la paleta de la
 * app (`styles.css`) para que las graficas no parezcan de otra aplicacion.
 * Todas las series tienen su tabla equivalente: la grafica es un apoyo visual,
 * no la unica forma de leer el dato.
 */

const COLORES = ['#0a8a7c', '#f59f5a', '#147d4f', '#b33939', '#5d6071', '#c9a227', '#7b8fc4', '#d98cb3'];

type EntradaTooltip = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
};

type PropsTooltip = {
  active?: boolean;
  payload?: EntradaTooltip[];
  label?: string | number;
};

function TooltipMoneda({ active, payload, label }: PropsTooltip) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="reporte-tooltip">
      {label !== undefined && <strong>{String(label)}</strong>}
      <ul>
        {payload.map((entrada) => (
          <li key={String(entrada.dataKey ?? entrada.name)}>
            <span
              className="reporte-tooltip-punto"
              style={{ background: entrada.color ?? '#0a8a7c' }}
            />
            <span>{entrada.name}</span>
            <strong>{moneda(Number(entrada.value ?? 0))}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tendencia de ingresos, gastos y balance. Maximo 12 periodos. */
export function GraficaTendencia({ datos }: { datos: PeriodoFinanciero[] }) {
  const serie = datos
    .slice(0, 12)
    .reverse()
    .map((fila) => ({
      periodo: formatearPeriodoCorto(fila.periodo),
      Ingresos: fila.ingresosTotales,
      Gastos: fila.gastos,
      Balance: fila.balanceNeto,
    }));

  if (serie.length === 0) {
    return <p className="empty-state">Sin periodos para graficar.</p>;
  }

  return (
    <div
      className="reporte-grafica"
      role="img"
      aria-label="Tendencia de ingresos, gastos y balance por periodo"
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5ddcf" vertical={false} />
          <XAxis dataKey="periodo" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={monedaCompacta} tick={{ fontSize: 12 }} width={68} />
          <Tooltip content={<TooltipMoneda />} />
          <Legend />
          <Bar dataKey="Ingresos" fill="#0a8a7c" radius={[6, 6, 0, 0]} maxBarSize={38} />
          <Bar dataKey="Gastos" fill="#f59f5a" radius={[6, 6, 0, 0]} maxBarSize={38} />
          <Line
            type="monotone"
            dataKey="Balance"
            stroke="#1f1f2e"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dona de gastos por categoria (top 6 + Otros). */
export function GraficaCategorias({ datos }: { datos: CategoriaGastoReporte[] }) {
  if (datos.length === 0) {
    return <p className="empty-state">Aun no hay gastos registrados en el rango.</p>;
  }

  const principales = datos.slice(0, 6);
  const resto = datos.slice(6).reduce((suma, fila) => suma + fila.monto, 0);
  const serie =
    resto > 0
      ? [...principales, { categoria: 'Otros', monto: resto, movimientos: 0, porcentaje: 0 }]
      : principales;

  return (
    <div
      className="reporte-grafica"
      role="img"
      aria-label="Distribucion de gastos por categoria"
    >
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={serie}
            dataKey="monto"
            nameKey="categoria"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={2}
          >
            {serie.map((entrada, indice) => (
              <Cell
                key={entrada.categoria}
                fill={COLORES[indice % COLORES.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<TooltipMoneda />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dona de metodos de pago. */
export function GraficaMetodos({ datos }: { datos: MetodoPagoReporte[] }) {
  if (datos.length === 0) {
    return <p className="empty-state">Aun no hay pagos validados en el rango.</p>;
  }

  const serie = datos.map((fila) => ({
    metodo: ETIQUETA_ORIGEN[fila.origen] ?? fila.origen,
    monto: fila.monto,
  }));

  return (
    <div className="reporte-grafica" role="img" aria-label="Distribucion de pagos por metodo">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={serie}
            dataKey="monto"
            nameKey="metodo"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={2}
          >
            {serie.map((entrada, indice) => (
              <Cell key={entrada.metodo} fill={COLORES[indice % COLORES.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipMoneda />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Antiguedad de adeudos por tramo de atraso. */
export function GraficaAntiguedad({ datos }: { datos: AntiguedadReporte[] }) {
  const serie = datos.map((fila) => ({
    etiqueta: fila.etiqueta,
    Capital: fila.capital,
    Recargos: fila.recargos,
  }));

  const total = serie.reduce((suma, fila) => suma + fila.Capital + fila.Recargos, 0);
  if (total === 0) {
    return <p className="empty-state">Sin adeudos en los periodos seleccionados.</p>;
  }

  return (
    <div
      className="reporte-grafica"
      role="img"
      aria-label="Antiguedad de adeudos por tramo de atraso"
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={serie}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5ddcf" horizontal={false} />
          <XAxis type="number" tickFormatter={monedaCompacta} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="etiqueta" width={110} tick={{ fontSize: 12 }} />
          <Tooltip content={<TooltipMoneda />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Capital" stackId="adeudo" fill="#b33939" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Recargos" stackId="adeudo" fill="#f59f5a" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Top de unidades con mayor adeudo (solo administrador). */
export function GraficaTopDeudores({ datos }: { datos: CobranzaUnidadReporte[] }) {
  if (datos.length === 0) {
    return <p className="empty-state">Todas las unidades estan al corriente.</p>;
  }

  const serie = datos.map((fila) => ({
    unidad: fila.claveUnidad,
    Adeudo: fila.adeudoTotal,
  }));

  return (
    <div
      className="reporte-grafica"
      role="img"
      aria-label="Unidades con mayor adeudo"
    >
      <ResponsiveContainer width="100%" height={Math.max(220, serie.length * 34 + 40)}>
        <BarChart
          data={serie}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5ddcf" horizontal={false} />
          <XAxis type="number" tickFormatter={monedaCompacta} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="unidad" width={80} tick={{ fontSize: 12 }} />
          <Tooltip content={<TooltipMoneda />} />
          <Bar dataKey="Adeudo" fill="#b33939" radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
