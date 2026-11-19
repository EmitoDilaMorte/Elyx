import { downloadBlob } from '../descargas';
import type { ReporteFinancieroResumen } from '../../types/reportes';
import {
  ETIQUETA_ESTADO_COBRANZA,
  ETIQUETA_ORIGEN,
  formatearPeriodo,
  slugArchivo,
  sufijoPeriodos,
} from './formato';

/**
 * Excel del reporte financiero.
 *
 * Lleva el detalle COMPLETO (todas las unidades y todos los movimientos), que
 * es justo lo que no cabe en el PDF ejecutivo. Las columnas de dinero se
 * escriben como numeros con formato, no como texto: si se exportaran como
 * "$1,234.00" la hoja no se podria sumar ni ordenar.
 */

type Fila = Array<string | number | null>;

const FORMATO_MONEDA = '"$"#,##0.00';
const FORMATO_PORCENTAJE = '0.0"%"';

/** Crea una hoja con anchos y formatos por columna. */
function crearHoja(
  XLSX: typeof import('xlsx'),
  filas: Fila[],
  anchos: number[],
  opciones: {
    /** Columnas (indice 0) que llevan formato de moneda o porcentaje. */
    moneda?: number[];
    porcentaje?: number[];
    autofiltro?: boolean;
  } = {},
) {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = anchos.map((ancho) => ({ wch: ancho }));

  const rango = XLSX.utils.decode_range(hoja['!ref'] ?? 'A1');
  const aplicar = (columnas: number[] | undefined, formato: string) => {
    for (const columna of columnas ?? []) {
      for (let fila = 1; fila <= rango.e.r; fila += 1) {
        const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })];
        if (celda && celda.t === 'n') {
          celda.z = formato;
        }
      }
    }
  };

  aplicar(opciones.moneda, FORMATO_MONEDA);
  aplicar(opciones.porcentaje, FORMATO_PORCENTAJE);

  if (opciones.autofiltro && rango.e.r > 0) {
    hoja['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rango.e.r, c: rango.e.c } }),
    };
  }

  return hoja;
}

export async function exportarReporteExcel(datos: ReporteFinancieroResumen): Promise<void> {
  const XLSX = await import('xlsx');
  const esAdmin = datos.rol === 'ADMINISTRADOR';
  const libro = XLSX.utils.book_new();

  // --- Resumen -------------------------------------------------------------
  const k = datos.kpis;
  const resumen: Fila[] = [
    ['Reporte financiero Elyx'],
    ['Condominio', datos.condominio.nombre],
    ['Direccion', datos.condominio.direccion ?? ''],
    ['RFC', datos.condominio.rfc ?? ''],
    ['Razon social', datos.condominio.razonSocial ?? ''],
    ['Contacto', [datos.condominio.correoContacto, datos.condominio.telefonoContacto].filter(Boolean).join(' · ')],
    [
      'Periodos',
      datos.periodos.length === 0
        ? 'Sin movimientos'
        : datos.periodos.length === 1
          ? formatearPeriodo(datos.periodos[0])
          : `${formatearPeriodo(datos.periodos[datos.periodos.length - 1])} a ${formatearPeriodo(datos.periodos[0])}`,
    ],
    ['Generado', new Date().toLocaleString('es-MX')],
    ['Rol', esAdmin ? 'Administrador' : 'Condomino'],
    [],
    ['Indicador', 'Valor'],
    ['Periodos incluidos', k.periodos],
    ['Facturado', k.facturado],
    ['Cobrado (capital)', k.cobradoCapital],
    ['Recargos cobrados', k.recargosCobrados],
    ['Ingresos totales', k.ingresosTotales],
    ['Gastos', k.gastos],
    ...(esAdmin ? [['Comisiones de Stripe', k.comisiones] as Fila] : []),
    ['Balance neto', k.balanceNeto],
    ['Adeudo capital', k.adeudoCapital],
    ['Recargos devengados', k.recargosEstimados],
    ['Adeudo total', k.adeudoTotal],
    ['Tasa de cobranza', Number((k.tasaCobranza * 100).toFixed(2))],
    ['Unidades activas', k.unidadesActivas],
    ['Unidades con adeudo', k.unidadesConAdeudo],
    ['Cuotas pendientes', k.cuotasPendientes],
  ];

  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(XLSX, resumen, [30, 42]),
    'Resumen',
  );
  // El resumen mezcla etiquetas y valores: el formato se aplica buscando la
  // etiqueta, no por numero de fila (la fila de comisiones cambia por rol).
  const hojaResumen = libro.Sheets.Resumen;
  const etiquetasMoneda = new Set([
    'Facturado',
    'Cobrado (capital)',
    'Recargos cobrados',
    'Ingresos totales',
    'Gastos',
    'Comisiones de Stripe',
    'Balance neto',
    'Adeudo capital',
    'Recargos devengados',
    'Adeudo total',
  ]);

  for (let fila = 0; fila < resumen.length; fila += 1) {
    const etiqueta = String(resumen[fila][0] ?? '');
    const celda = hojaResumen[XLSX.utils.encode_cell({ r: fila, c: 1 })];
    if (celda && celda.t === 'n' && etiquetasMoneda.has(etiqueta)) {
      celda.z = FORMATO_MONEDA;
    }
    if (celda && celda.t === 'n' && etiqueta === 'Tasa de cobranza') {
      celda.z = FORMATO_PORCENTAJE;
    }
  }

  // --- Periodos ------------------------------------------------------------
  const periodoEncabezado = [
    'Periodo',
    'Facturado',
    'Cobrado capital',
    'Recargos cobrados',
    'Ingresos totales',
    'Gastos',
    ...(esAdmin ? ['Comisiones'] : []),
    'Balance neto',
    'Adeudo capital',
    'Recargos devengados',
    'Adeudo total',
    'Tasa cobranza %',
    'Cuotas',
    'Cuotas pagadas',
    'Cuotas pendientes',
    'Pagos validados',
    'Gastos registrados',
  ];

  const periodoFilas: Fila[] = datos.seriePeriodos.map((fila) => [
    formatearPeriodo(fila.periodo),
    fila.facturado,
    fila.cobradoCapital,
    fila.recargosCobrados,
    fila.ingresosTotales,
    fila.gastos,
    ...(esAdmin ? [fila.comisiones] : []),
    fila.balanceNeto,
    fila.adeudoCapital,
    fila.recargosEstimados,
    fila.adeudoTotal,
    Number((fila.tasaCobranza * 100).toFixed(2)),
    fila.cuotas,
    fila.cuotasPagadas,
    fila.cuotasPendientes,
    fila.pagosValidados,
    fila.gastosRegistrados,
  ]);

  const indiceColumna = (titulo: string) => periodoEncabezado.indexOf(titulo);
  const columnasMoneda = [
    'Facturado',
    'Cobrado capital',
    'Recargos cobrados',
    'Ingresos totales',
    'Gastos',
    'Comisiones',
    'Balance neto',
    'Adeudo capital',
    'Recargos devengados',
    'Adeudo total',
  ]
    .map(indiceColumna)
    .filter((indice) => indice >= 0);

  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(XLSX, [periodoEncabezado, ...periodoFilas], [
      14, 14, 16, 16, 16, 14, ...(esAdmin ? [14] : []), 15, 16, 18, 16, 14, 10, 14, 16, 16, 18,
    ], {
      moneda: columnasMoneda,
      porcentaje: [indiceColumna('Tasa cobranza %')],
      autofiltro: true,
    }),
    'Periodos',
  );

  // --- Gastos por categoria ------------------------------------------------
  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(
      XLSX,
      [
        ['Categoria', 'Movimientos', 'Monto', 'Porcentaje %'],
        ...datos.gastosPorCategoria.map((fila) => [
          fila.categoria,
          fila.movimientos,
          fila.monto,
          Number(fila.porcentaje.toFixed(2)),
        ]),
      ],
      [30, 14, 16, 16],
      { moneda: [2], porcentaje: [3], autofiltro: true },
    ),
    'Gastos categoria',
  );

  // --- Metodos de pago -----------------------------------------------------
  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(
      XLSX,
      [
        ['Metodo', 'Pagos', 'Monto', 'Recargos', 'Porcentaje %'],
        ...datos.metodosPago.map((fila) => [
          ETIQUETA_ORIGEN[fila.origen] ?? fila.origen,
          fila.pagos,
          fila.monto,
          fila.recargos,
          Number(fila.porcentaje.toFixed(2)),
        ]),
      ],
      [24, 10, 16, 14, 16],
      { moneda: [2, 3], porcentaje: [4], autofiltro: true },
    ),
    'Metodos pago',
  );

  // --- Antiguedad ----------------------------------------------------------
  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(
      XLSX,
      [
        ['Tramo', 'Cuotas', 'Capital', 'Recargos'],
        ...datos.antiguedadAdeudos.map((fila) => [
          fila.etiqueta,
          fila.cuotas,
          fila.capital,
          fila.recargos,
        ]),
      ],
      [20, 10, 16, 14],
      { moneda: [2, 3], autofiltro: true },
    ),
    'Antiguedad',
  );

  // --- Cartera (solo administrador) ---------------------------------------
  if (esAdmin) {
    XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        XLSX,
        [
          [
            'Unidad',
            'Tipo',
            'Ocupante',
            'Facturado',
            'Cobrado capital',
            'Recargos cobrados',
            'Adeudo capital',
            'Recargos devengados',
            'Adeudo total',
            'Cuotas',
            'Cuotas pendientes',
            'Dias atraso maximo',
            'Estado',
          ],
          ...(datos.cobranzaPorUnidad ?? []).map((unidad) => [
            unidad.claveUnidad,
            unidad.tipoUnidad,
            unidad.ocupante ?? 'Sin ocupante',
            unidad.facturado,
            unidad.cobradoCapital,
            unidad.recargosCobrados,
            unidad.adeudoCapital,
            unidad.recargosEstimados,
            unidad.adeudoTotal,
            unidad.cuotas,
            unidad.cuotasPendientes,
            unidad.diasAtrasoMax,
            ETIQUETA_ESTADO_COBRANZA[unidad.estado] ?? unidad.estado,
          ]),
        ],
        [14, 14, 28, 14, 16, 16, 15, 18, 14, 10, 16, 14, 14],
        { moneda: [3, 4, 5, 6, 7, 8], autofiltro: true },
      ),
      'Cobranza unidad',
    );
  } else if (datos.miUnidad) {
    const unidad = datos.miUnidad;
    XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        XLSX,
        [
          ['Tu unidad'],
          ['Unidad(es)', unidad.clavesUnidad.join(', ')],
          [],
          ['Indicador', 'Valor'],
          ['Facturado', unidad.facturado],
          ['Pagado (capital)', unidad.cobradoCapital],
          ['Recargos pagados', unidad.recargosCobrados],
          ['Adeudo capital', unidad.adeudoCapital],
          ['Recargos devengados', unidad.recargosEstimados],
          ['Adeudo total', unidad.adeudoTotal],
          ['Cuotas', unidad.cuotas],
          ['Cuotas pendientes', unidad.cuotasPendientes],
          ['Dias atraso maximo', unidad.diasAtrasoMax],
          ['Estado', ETIQUETA_ESTADO_COBRANZA[unidad.estado] ?? unidad.estado],
        ],
        [26, 24],
        { moneda: [] },
      ),
      'Mi unidad',
    );
    const hojaMiUnidad = libro.Sheets['Mi unidad'];
    for (let fila = 4; fila <= 9; fila += 1) {
      const celda = hojaMiUnidad[XLSX.utils.encode_cell({ r: fila, c: 1 })];
      if (celda && celda.t === 'n') {
        celda.z = FORMATO_MONEDA;
      }
    }
  }

  // --- Movimientos ---------------------------------------------------------
  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(
      XLSX,
      [
        [
          'Folio',
          'Periodo',
          'Tipo',
          'Unidad',
          'Fecha',
          'Estado',
          'Origen',
          'Referencia',
          'Monto',
          'Recargo',
          'Capital',
        ],
        ...datos.movimientos.pagos.map((pago) => [
          pago.idPago,
          formatearPeriodo(pago.periodo),
          pago.tipo,
          pago.claveUnidad ?? '',
          new Date(pago.fechaPago).toLocaleDateString('es-MX'),
          pago.estado,
          ETIQUETA_ORIGEN[pago.origen] ?? pago.origen,
          pago.referencia ?? '',
          pago.monto,
          pago.montoRecargo,
          Number((pago.monto - pago.montoRecargo).toFixed(2)),
        ]),
      ],
      [10, 14, 24, 12, 14, 14, 18, 24, 14, 14, 14],
      { moneda: [8, 9, 10], autofiltro: true },
    ),
    'Pagos',
  );

  XLSX.utils.book_append_sheet(
    libro,
    crearHoja(
      XLSX,
      [
        ['Concepto', 'Categoria', 'Proveedor', 'Fecha', 'Monto'],
        ...datos.movimientos.gastos.map((gasto) => [
          gasto.concepto,
          gasto.categoria,
          gasto.proveedor ?? '',
          new Date(gasto.fecha).toLocaleDateString('es-MX'),
          gasto.monto,
        ]),
      ],
      [34, 20, 22, 14, 14],
      { moneda: [4], autofiltro: true },
    ),
    'Gastos',
  );

  const archivo = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([archivo], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(
    blob,
    `reporte-${slugArchivo(datos.condominio.nombre)}-${sufijoPeriodos(datos.periodos)}.xlsx`,
  );
}
