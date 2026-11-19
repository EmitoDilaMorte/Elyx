import type { ReciboGenerado } from '../../types/recibos';
import { downloadBlob } from '../descargas';
import {
  COLOR,
  MARGEN,
  A4,
  asegurarEspacio,
  crearDocumento,
  finalizar,
  guardar,
  limpiarTexto,
  lineasDeTexto,
  parrafo,
  seccion,
  tabla,
  texto,
  type ContextoPdf,
} from '../pdf/layout';
import { cargarLogo } from '../pdf/logo';
import { moneda } from '../reportes/formato';
import { importeEnLetras } from './numero-a-letras';

/**
 * PDF del recibo de pago.
 *
 * Es un documento **informativo**: no es un CFDI ni sustituye a la factura. Se
 * genera bajo demanda en el navegador (no se guarda en el servidor) y se
 * descarga directo, igual que antes, pero con los datos reales del pago:
 * condominio, unidad, condomino, periodo, metodo y desglose de importes.
 */

function fechaLarga(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fechaHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Dibuja una fila de campos (etiqueta arriba, valor debajo).
 *
 * La altura se calcula con el campo mas largo: una referencia de Stripe o una
 * direccion larga ocupa varias lineas y antes se recortaba con "...", con lo
 * que el dato impreso dejaba de coincidir con el pago.
 */
function filaDeCampos(
  ctx: ContextoPdf,
  campos: Array<{ etiqueta: string; valor: string }>,
) {
  const sizeEtiqueta = 7.2;
  const sizeValor = 9;
  const altoLinea = 11;
  const ancho = (A4.width - MARGEN * 2) / campos.length;
  const anchoValor = ancho - 10;

  const valores = campos.map((item) =>
    lineasDeTexto(ctx.bold, item.valor || '-', sizeValor, anchoValor),
  );
  const maxLineas = Math.max(1, ...valores.map((lineas) => lineas.length));
  const alto = 18 + maxLineas * altoLinea + 8;

  asegurarEspacio(ctx, alto);

  campos.forEach((item, indice) => {
    const x = MARGEN + indice * ancho;

    ctx.pagina.drawText(limpiarTexto(item.etiqueta.toUpperCase()), {
      x,
      y: ctx.y - sizeEtiqueta,
      size: sizeEtiqueta,
      font: ctx.font,
      color: COLOR.tintaSuave,
    });

    valores[indice].forEach((linea, posicion) => {
      ctx.pagina.drawText(linea, {
        x,
        y: ctx.y - 17 - posicion * altoLinea,
        size: sizeValor,
        font: ctx.bold,
        color: COLOR.tinta,
      });
    });
  });

  ctx.y -= alto;
}

export async function generarReciboPdf(recibo: ReciboGenerado): Promise<void> {
  const { detalle } = recibo;
  const logo = await cargarLogo();

  const ctx = await crearDocumento({
    titulo: 'Recibo de pago',
    subtitulo: `${detalle.condominio.nombre} · ${detalle.unidad ? `Unidad ${detalle.unidad.claveUnidad}` : 'Sin unidad'}`,
    folio: detalle.folio,
    logoBytes: logo,
  });

  // --- Identificacion ------------------------------------------------------
  seccion(ctx, 'Datos del condominio');
  const lineasCondominio = [
    detalle.condominio.direccion,
    detalle.condominio.rfc
      ? `RFC: ${detalle.condominio.rfc}${detalle.condominio.razonSocial ? ` · ${detalle.condominio.razonSocial}` : ''}`
      : null,
    [detalle.condominio.correoContacto, detalle.condominio.telefonoContacto]
      .filter(Boolean)
      .join(' · ') || null,
  ].filter((linea): linea is string => Boolean(linea));

  for (const linea of lineasCondominio) {
    texto(ctx, linea, { size: 8.5, color: COLOR.tintaSuave });
  }
  ctx.y -= 6;

  filaDeCampos(ctx, [
    { etiqueta: 'Folio', valor: detalle.folio },
    { etiqueta: 'Fecha de emision', valor: fechaHora(detalle.fechaGeneracion) },
    { etiqueta: 'Estado del pago', valor: detalle.pago.estado },
  ]);

  // --- Partes --------------------------------------------------------------
  seccion(ctx, 'Datos del pago');
  filaDeCampos(ctx, [
    { etiqueta: 'Condomino', valor: detalle.condomino?.nombre ?? 'No registrado' },
    { etiqueta: 'Correo', valor: detalle.condomino?.correo ?? '-' },
  ]);
  filaDeCampos(ctx, [
    {
      etiqueta: 'Unidad',
      valor: detalle.unidad
        ? `${detalle.unidad.claveUnidad} (${detalle.unidad.tipoUnidad.toLowerCase()})`
        : 'Sin unidad',
    },
    { etiqueta: 'Periodo', valor: detalle.cuota.periodo },
    { etiqueta: 'Fecha limite', valor: fechaLarga(detalle.cuota.fechaLimite) },
  ]);
  filaDeCampos(ctx, [
    { etiqueta: 'Fecha del pago', valor: fechaLarga(detalle.pago.fechaPago) },
    { etiqueta: 'Metodo de pago', valor: detalle.pago.metodoPago },
    {
      etiqueta: 'Referencia',
      valor:
        detalle.pago.referencia ??
        detalle.cargo?.referenciaSpei ??
        detalle.cargo?.paymentIntentId ??
        `Pago #${detalle.pago.idPago}`,
    },
  ]);

  // --- Conceptos -----------------------------------------------------------
  seccion(ctx, 'Conceptos');

  const conceptos: string[][] = [
    [
      detalle.cuota.tipo,
      detalle.cuota.periodo,
      moneda(detalle.pago.montoCapital),
    ],
  ];

  if (detalle.pago.montoRecargo > 0) {
    conceptos.push([
      'Recargo por atraso',
      'Dias posteriores a la fecha limite',
      moneda(detalle.pago.montoRecargo),
    ]);
  }

  if (detalle.pago.ajuste !== 0) {
    conceptos.push([
      'Ajuste',
      detalle.pago.ajuste > 0 ? 'Diferencia a favor del condominio' : 'Diferencia a favor del condomino',
      moneda(detalle.pago.ajuste),
    ]);
  }

  tabla(
    ctx,
    [
      { titulo: 'Concepto', ancho: 250 },
      { titulo: 'Detalle', ancho: 151 },
      { titulo: 'Importe', ancho: 110, alinear: 'derecha' },
    ],
    conceptos,
    { size: 9 },
  );

  // Total destacado.
  asegurarEspacio(ctx, 46);
  const totalEtiqueta = detalle.pago.montoRecargo > 0 ? 'TOTAL PAGADO' : 'TOTAL';
  ctx.pagina.drawRectangle({
    x: MARGEN,
    y: ctx.y - 30,
    width: A4.width - MARGEN * 2,
    height: 30,
    color: COLOR.fondo,
  });
  ctx.pagina.drawText(totalEtiqueta, {
    x: MARGEN + 8,
    y: ctx.y - 20,
    size: 10,
    font: ctx.bold,
    color: COLOR.tintaSuave,
  });
  const totalTexto = moneda(detalle.pago.monto);
  const anchoTotal = ctx.bold.widthOfTextAtSize(totalTexto, 14);
  ctx.pagina.drawText(totalTexto, {
    x: A4.width - MARGEN - 8 - anchoTotal,
    y: ctx.y - 22,
    size: 14,
    font: ctx.bold,
    color: COLOR.marcaOscura,
  });
  ctx.y -= 44;

  // --- Monto en letras -----------------------------------------------------
  seccion(ctx, 'Importe en letras');
  const letras = importeEnLetras(detalle.pago.monto);
  const lineasLetras = lineasDeTexto(ctx.font, letras, 9.5, A4.width - MARGEN * 2 - 20);
  const altoLetras = lineasLetras.length * 12 + 16;

  asegurarEspacio(ctx, altoLetras);
  ctx.pagina.drawRectangle({
    x: MARGEN,
    y: ctx.y - altoLetras,
    width: A4.width - MARGEN * 2,
    height: altoLetras,
    color: COLOR.fondoSuave,
    borderColor: COLOR.linea,
    borderWidth: 0.6,
  });
  lineasLetras.forEach((linea, indice) => {
    ctx.pagina.drawText(linea, {
      x: MARGEN + 10,
      y: ctx.y - 15 - indice * 12,
      size: 9.5,
      font: ctx.bold,
      color: COLOR.tinta,
    });
  });
  ctx.y -= altoLetras + 14;

  // --- Nota legal ----------------------------------------------------------
  seccion(ctx, 'Nota');
  parrafo(
    ctx,
    'Documento informativo que acredita el pago registrado en Elyx. No es un comprobante fiscal digital (CFDI) ni sustituye a la factura correspondiente.',
    { size: 8, color: COLOR.tintaSuave },
  );

  if (detalle.pago.montoRecargo > 0) {
    parrafo(
      ctx,
      'El recargo por atraso se calcula con la tasa diaria configurada por el condominio y los dias transcurridos desde la fecha limite.',
      { size: 8, color: COLOR.tintaSuave },
    );
  }

  finalizar(ctx, 'Recibo informativo generado por Elyx. No es un comprobante fiscal.');

  const bytes = await guardar(ctx);
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${detalle.folio}.pdf`);
}
