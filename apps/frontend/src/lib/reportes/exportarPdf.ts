import { downloadBlob } from '../descargas';
import type { ReporteFinancieroResumen } from '../../types/reportes';
import {
  ETIQUETA_ORIGEN,
  formatearPeriodo,
  moneda,
  porcentaje,
  sufijoPeriodos,
  slugArchivo,
} from './formato';
import {
  COLOR,
  barrasComparadas,
  barrasHorizontales,
  colorHex,
  crearDocumento,
  finalizar,
  guardar,
  kpis,
  leyenda,
  parrafo,
  seccion,
  tabla,
  texto,
  type ColumnaTabla,
  type ContextoPdf,
} from '../pdf/layout';
import { cargarLogo } from '../pdf/logo';

/**
 * PDF ejecutivo del reporte financiero.
 *
 * Incluye KPIs, tendencia, categorias, metodos y el detalle por periodo. La
 * cartera completa va al Excel: un PDF con 200 unidades deja de ser un reporte
 * ejecutivo. Se recortan las unidades a 20 y se avisa en el documento.
 */

const PALETA = ['#0a8a7c', '#f59f5a', '#147d4f', '#b33939', '#5d6071', '#c9a227', '#7b8fc4'];

const MAX_UNIDADES_PDF = 20;

/** `2026-11-18 21:30` legible en el encabezado. */
function marcaDeTiempo(): string {
  return new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function folioReporte(datos: ReporteFinancieroResumen): string {
  const ahora = new Date();
  const dosDigitos = (valor: number) => String(valor).padStart(2, '0');
  const sello = `${ahora.getFullYear()}${dosDigitos(ahora.getMonth() + 1)}${dosDigitos(
    ahora.getDate(),
  )}-${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}`;
  return `REP-${datos.idCondominio}-${sello}`;
}

function dibujarDatosCondominio(ctx: ContextoPdf, datos: ReporteFinancieroResumen) {
  const lineas = [
    `Condominio: ${datos.condominio.nombre}`,
    datos.condominio.direccion ? `Direccion: ${datos.condominio.direccion}` : null,
    datos.condominio.rfc
      ? `RFC: ${datos.condominio.rfc}${datos.condominio.razonSocial ? ` · ${datos.condominio.razonSocial}` : ''}`
      : null,
    datos.condominio.correoContacto || datos.condominio.telefonoContacto
      ? `Contacto: ${[datos.condominio.correoContacto, datos.condominio.telefonoContacto]
          .filter(Boolean)
          .join(' · ')}`
      : null,
    `Periodos: ${
      datos.periodos.length === 0
        ? 'Sin movimientos'
        : datos.periodos.length === 1
          ? formatearPeriodo(datos.periodos[0])
          : `${formatearPeriodo(datos.periodos[datos.periodos.length - 1])} a ${formatearPeriodo(datos.periodos[0])}`
    }`,
    `Generado: ${marcaDeTiempo()}`,
  ].filter((linea): linea is string => Boolean(linea));

  for (const linea of lineas) {
    // `texto` ya avanza el cursor: una direccion larga se envuelve en varias
    // lineas en vez de recortarse con puntos suspensivos.
    texto(ctx, linea, { size: 8.5, color: COLOR.tintaSuave });
  }
  ctx.y -= 4;
}

function dibujarResumen(ctx: ContextoPdf, datos: ReporteFinancieroResumen) {
  const esAdmin = datos.rol === 'ADMINISTRADOR';
  const k = datos.kpis;

  seccion(ctx, 'Resumen ejecutivo');

  const tarjetas = [
    { etiqueta: 'Facturado', valor: moneda(k.facturado), nota: 'Cuotas emitidas' },
    { etiqueta: 'Cobrado (capital)', valor: moneda(k.cobradoCapital), nota: 'Sin recargos' },
    {
      etiqueta: 'Recargos cobrados',
      valor: moneda(k.recargosCobrados),
      nota: 'Por atraso',
    },
    {
      etiqueta: 'Tasa de cobranza',
      valor: porcentaje(k.tasaCobranza),
      nota: 'Cobrado / facturado',
    },
    { etiqueta: 'Gastos', valor: moneda(k.gastos), nota: 'Egresos del rango' },
    ...(esAdmin
      ? [
          {
            etiqueta: 'Comisiones Stripe',
            valor: moneda(k.comisiones),
            nota: 'Descontadas del deposito',
          },
        ]
      : []),
    {
      etiqueta: 'Balance neto',
      valor: moneda(k.balanceNeto),
      nota: esAdmin ? 'Ingresos - gastos - comisiones' : 'Ingresos - gastos',
      alerta: k.balanceNeto < 0,
    },
    {
      etiqueta: 'Adeudo total',
      valor: moneda(k.adeudoTotal),
      nota: `${moneda(k.adeudoCapital)} capital + ${moneda(k.recargosEstimados)} recargos`,
      alerta: true,
    },
    {
      etiqueta: esAdmin ? 'Unidades con adeudo' : 'Cuotas pendientes',
      valor: esAdmin
        ? `${k.unidadesConAdeudo} de ${k.unidadesActivas}`
        : String(k.cuotasPendientes),
      nota: esAdmin ? 'Unidades activas' : 'En los periodos',
    },
  ];

  kpis(ctx, tarjetas);

  if (k.recargosCobrados + k.recargosEstimados === 0) {
    parrafo(ctx, 'Este condominio no tiene recargos por atraso configurados o no se han devengado en el rango.', {
      size: 8,
      color: COLOR.tintaSuave,
    });
  } else {
    parrafo(
      ctx,
      'Los recargos se calculan con la tasa diaria configurada en cada cuota por los dias de atraso. El recargo cobrado queda congelado en el pago; el devengado corresponde a cuotas aun pendientes.',
      { size: 8, color: COLOR.tintaSuave },
    );
  }
}

function dibujarTendencia(ctx: ContextoPdf, datos: ReporteFinancieroResumen) {
  const filas = datos.seriePeriodos
    .slice(0, 12)
    .reverse()
    .map((fila) => ({
      etiqueta: formatearPeriodo(fila.periodo),
      valores: [
        { valor: fila.ingresosTotales, color: COLOR.marca, etiqueta: moneda(fila.ingresosTotales) },
        { valor: fila.gastos, color: COLOR.acento, etiqueta: moneda(fila.gastos) },
      ],
    }));

  seccion(ctx, 'Tendencia de ingresos y gastos');
  barrasComparadas(ctx, filas);
  leyenda(ctx, [
    { etiqueta: 'Ingresos (capital + recargos)', color: COLOR.marca },
    { etiqueta: 'Gastos', color: COLOR.acento },
  ]);
}

function dibujarCategorias(ctx: ContextoPdf, datos: ReporteFinancieroResumen) {
  seccion(ctx, 'Gastos por categoria');

  const filas = datos.gastosPorCategoria.slice(0, 8).map((categoria, indice) => ({
    etiqueta: categoria.categoria,
    segmentos: [{ valor: categoria.monto, color: palette(indice) }],
    valorTexto: moneda(categoria.monto),
  }));

  barrasHorizontales(ctx, filas, { anchoEtiqueta: 130 });

  if (datos.gastosPorCategoria.length > 0) {
    tabla(
      ctx,
      [
        { titulo: 'Categoria', ancho: 230 },
        { titulo: 'Movimientos', ancho: 80, alinear: 'derecha' },
        { titulo: 'Monto', ancho: 100, alinear: 'derecha' },
        { titulo: '% del gasto', ancho: 101, alinear: 'derecha' },
      ],
      datos.gastosPorCategoria.map((fila) => [
        fila.categoria,
        String(fila.movimientos),
        moneda(fila.monto),
        `${fila.porcentaje.toFixed(1)}%`,
      ]),
    );
  }
}

function dibujarMetodos(ctx: ContextoPdf, datos: ReporteFinancieroResumen) {
  seccion(ctx, 'Metodos de pago');

  const filas = datos.metodosPago.map((metodo, indice) => ({
    etiqueta: ETIQUETA_ORIGEN[metodo.origen] ?? metodo.origen,
    segmentos: [{ valor: metodo.monto, color: palette(indice) }],
    valorTexto: moneda(metodo.monto),
  }));

  barrasHorizontales(ctx, filas, { anchoEtiqueta: 130 });

  if (datos.metodosPago.length > 0) {
    tabla(
      ctx,
      [
        { titulo: 'Metodo', ancho: 190 },
        { titulo: 'Pagos', ancho: 70, alinear: 'derecha' },
        { titulo: 'Monto', ancho: 110, alinear: 'derecha' },
        { titulo: 'Recargos', ancho: 70, alinear: 'derecha' },
        { titulo: '% cobrado', ancho: 71, alinear: 'derecha' },
      ],
      datos.metodosPago.map((fila) => [
        ETIQUETA_ORIGEN[fila.origen] ?? fila.origen,
        String(fila.pagos),
        moneda(fila.monto),
        moneda(fila.recargos),
        `${fila.porcentaje.toFixed(1)}%`,
      ]),
    );
  }
}

/**
 * Exporta el reporte financiero a PDF y lo descarga.
 */
export async function exportarReportePdf(datos: ReporteFinancieroResumen): Promise<void> {
  const esAdmin = datos.rol === 'ADMINISTRADOR';
  const logo = await cargarLogo();

  const ctx = await crearDocumento({
    titulo: 'Reporte financiero',
    subtitulo: `${datos.condominio.nombre} · ${
      datos.periodos.length === 0
        ? 'Sin movimientos'
        : datos.periodos.length === 1
          ? formatearPeriodo(datos.periodos[0])
          : `${formatearPeriodo(datos.periodos[datos.periodos.length - 1])} a ${formatearPeriodo(datos.periodos[0])}`
    }`,
    folio: folioReporte(datos),
    logoBytes: logo,
  });

  dibujarDatosCondominio(ctx, datos);
  dibujarResumen(ctx, datos);
  dibujarTendencia(ctx, datos);
  dibujarCategorias(ctx, datos);
  dibujarMetodos(ctx, datos);

  seccion(ctx, 'Detalle por periodo');
  const columnasPeriodo: ColumnaTabla[] = [
    { titulo: 'Periodo', ancho: 62 },
    { titulo: 'Facturado', ancho: 56, alinear: 'derecha' },
    { titulo: 'Cobrado', ancho: 56, alinear: 'derecha' },
    { titulo: 'Recargos', ancho: 58, alinear: 'derecha' },
    { titulo: 'Tasa', ancho: 40, alinear: 'derecha' },
    { titulo: 'Gastos', ancho: 52, alinear: 'derecha' },
    esAdmin
      ? { titulo: 'Comisiones', ancho: 58, alinear: 'derecha' }
      : { titulo: 'Pendientes', ancho: 58, alinear: 'derecha' },
    { titulo: 'Balance', ancho: 56, alinear: 'derecha' },
    { titulo: 'Adeudo total', ancho: 73, alinear: 'derecha' },
  ];

  tabla(
    ctx,
    columnasPeriodo,
    datos.seriePeriodos.map((fila) => [
      formatearPeriodo(fila.periodo),
      moneda(fila.facturado),
      moneda(fila.cobradoCapital),
      moneda(fila.recargosCobrados),
      porcentaje(fila.tasaCobranza),
      moneda(fila.gastos),
      esAdmin ? moneda(fila.comisiones) : String(fila.cuotasPendientes),
      moneda(fila.balanceNeto),
      moneda(fila.adeudoTotal),
    ]),
    { maxFilas: 24 },
  );

  if (datos.seriePeriodos.length > 24) {
    parrafo(ctx, 'El detalle completo por periodo esta en el archivo Excel.', {
      size: 8,
      color: COLOR.tintaSuave,
    });
  }

  if (esAdmin) {
    seccion(ctx, 'Antiguedad de adeudos');
    barrasHorizontales(
      ctx,
      datos.antiguedadAdeudos.map((bucket) => ({
        etiqueta: bucket.etiqueta,
        segmentos: [
          { valor: bucket.capital, color: COLOR.peligro },
          { valor: bucket.recargos, color: COLOR.acento },
        ],
        valorTexto: moneda(bucket.capital + bucket.recargos),
      })),
      { anchoEtiqueta: 100 },
    );
    leyenda(ctx, [
      { etiqueta: 'Capital', color: COLOR.peligro },
      { etiqueta: 'Recargos', color: COLOR.acento },
    ]);

    tabla(
      ctx,
      [
        { titulo: 'Tramo', ancho: 170 },
        { titulo: 'Cuotas', ancho: 70, alinear: 'derecha' },
        { titulo: 'Capital', ancho: 135, alinear: 'derecha' },
        { titulo: 'Recargos', ancho: 136, alinear: 'derecha' },
      ],
      datos.antiguedadAdeudos.map((fila) => [
        fila.etiqueta,
        String(fila.cuotas),
        moneda(fila.capital),
        moneda(fila.recargos),
      ]),
    );

    seccion(ctx, 'Unidades con mayor adeudo');
    barrasHorizontales(
      ctx,
      (datos.topDeudores ?? []).map((unidad) => ({
        etiqueta: `${unidad.claveUnidad}${unidad.ocupante ? ` · ${unidad.ocupante}` : ''}`,
        segmentos: [{ valor: unidad.adeudoTotal, color: COLOR.peligro }],
        valorTexto: moneda(unidad.adeudoTotal),
      })),
      { anchoEtiqueta: 170 },
    );

    seccion(ctx, 'Cobranza por unidad');
    const unidades = datos.cobranzaPorUnidad ?? [];
    const dibujadas = tabla(
      ctx,
      [
        { titulo: 'Unidad', ancho: 62 },
        { titulo: 'Ocupante', ancho: 118 },
        { titulo: 'Facturado', ancho: 64, alinear: 'derecha' },
        { titulo: 'Cobrado', ancho: 64, alinear: 'derecha' },
        { titulo: 'Adeudo', ancho: 78, alinear: 'derecha' },
        { titulo: 'Recargos', ancho: 62, alinear: 'derecha' },
        { titulo: 'Atraso', ancho: 63, alinear: 'derecha' },
      ],
      unidades.map((unidad) => [
        unidad.claveUnidad,
        unidad.ocupante ?? 'Sin ocupante',
        moneda(unidad.facturado),
        moneda(unidad.cobradoCapital),
        moneda(unidad.adeudoTotal),
        moneda(unidad.recargosEstimados),
        unidad.diasAtrasoMax > 0 ? `${unidad.diasAtrasoMax} dias` : '-',
      ]),
      { maxFilas: MAX_UNIDADES_PDF },
    );

    if (unidades.length > dibujadas) {
      parrafo(
        ctx,
        `Se muestran ${dibujadas} de ${unidades.length} unidades. El detalle completo esta en el archivo Excel.`,
        { size: 8, color: COLOR.tintaSuave },
      );
    }
  } else if (datos.miUnidad) {
    const unidad = datos.miUnidad;
    seccion(ctx, 'Tu unidad');
    kpis(ctx, [
      { etiqueta: 'Facturado', valor: moneda(unidad.facturado) },
      { etiqueta: 'Pagado (capital)', valor: moneda(unidad.cobradoCapital) },
      { etiqueta: 'Recargos pagados', valor: moneda(unidad.recargosCobrados) },
      { etiqueta: 'Adeudo capital', valor: moneda(unidad.adeudoCapital), alerta: true },
      { etiqueta: 'Recargos devengados', valor: moneda(unidad.recargosEstimados) },
      { etiqueta: 'Adeudo total', valor: moneda(unidad.adeudoTotal), alerta: true },
    ]);
    parrafo(
      ctx,
      `Unidad(es): ${unidad.clavesUnidad.join(', ') || 'Sin unidad'} · Cuotas pendientes: ${unidad.cuotasPendientes} de ${unidad.cuotas} · Atraso maximo: ${
        unidad.diasAtrasoMax > 0 ? `${unidad.diasAtrasoMax} dias` : 'sin atraso'
      }.`,
      { size: 8.5, color: COLOR.tintaSuave },
    );
  }

  parrafo(
    ctx,
    'Documento informativo. Los importes se calculan a partir de cuotas, pagos, gastos y comisiones registrados en Elyx a la fecha de generacion.',
    { size: 7.5, color: COLOR.tintaSuave },
  );

  finalizar(ctx, 'Reporte informativo generado por Elyx. No es un comprobante fiscal.');
  const bytes = await guardar(ctx);

  const nombre = `reporte-${slugArchivo(datos.condominio.nombre)}-${sufijoPeriodos(datos.periodos)}.pdf`;
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), nombre);
}

function palette(indice: number) {
  return colorHex(PALETA[indice % PALETA.length]);
}
