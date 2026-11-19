import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';

/**
 * Utilidades de maquetacion para los PDF de Elyx (reportes y recibos).
 *
 * `pdf-lib` no trae tablas, saltos de pagina ni envoltura de texto: se
 * implementan aqui una sola vez para que el reporte y el recibo se vean igual y
 * para no repetir el manejo de paginas en cada exportacion.
 *
 * **Texto**: las fuentes estandar usan WinAnsi, que cubre acentos y enie pero no
 * emojis ni simbolos exoticos. `limpiarTexto` los sustituye para que
 * `drawText` nunca lance a mitad de la generacion.
 */

export const A4 = { width: 595.28, height: 841.89 };
export const MARGEN = 42;
export const ANCHO_UTIL = A4.width - MARGEN * 2;
export const PIE_ALTO = 34;

export const COLOR = {
  marca: rgb(0.039, 0.541, 0.486),
  marcaOscura: rgb(0.024, 0.404, 0.369),
  acento: rgb(0.961, 0.624, 0.353),
  tinta: rgb(0.122, 0.122, 0.18),
  tintaSuave: rgb(0.365, 0.376, 0.443),
  linea: rgb(0.843, 0.843, 0.871),
  fondo: rgb(0.976, 0.969, 0.949),
  fondoSuave: rgb(0.988, 0.98, 0.969),
  exito: rgb(0.078, 0.49, 0.31),
  peligro: rgb(0.702, 0.224, 0.224),
  blanco: rgb(1, 1, 1),
};

/** Convierte `#0a8a7c` en un color de pdf-lib. */
export function colorHex(hex: string): RGB {
  const limpio = hex.replace('#', '');
  const valor = limpio.length === 3
    ? limpio.split('').map((c) => c + c).join('')
    : limpio;
  return rgb(
    parseInt(valor.slice(0, 2), 16) / 255,
    parseInt(valor.slice(2, 4), 16) / 255,
    parseInt(valor.slice(4, 6), 16) / 255,
  );
}

const REEMPLAZOS: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u2022': '-',
  '\u00b7': '-',
  '\u2192': '->',
  '\u2264': '<=',
  '\u2265': '>=',
};

/** Deja solo caracteres representables en WinAnsi. */
export function limpiarTexto(texto: string): string {
  return String(texto ?? '').replace(/[^\x00-\xFF]/g, (caracter) => REEMPLAZOS[caracter] ?? '?');
}

export type ContextoPdf = {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  pagina: PDFPage;
  y: number;
  paginas: number;
  titulo: string;
  folio: string;
  logo: PDFImage | null;
};

export type OpcionesDocumento = {
  titulo: string;
  subtitulo?: string;
  folio?: string;
  /** Bytes del logo; si falla la carga se usa el texto "ELYX". */
  logoBytes?: ArrayBuffer | null;
};

/** Crea el documento con la banda de marca y el encabezado de la primera pagina. */
export async function crearDocumento(opciones: OpcionesDocumento): Promise<ContextoPdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pagina = doc.addPage([A4.width, A4.height]);

  let logo: PDFImage | null = null;
  if (opciones.logoBytes) {
    try {
      logo = await doc.embedPng(opciones.logoBytes);
    } catch {
      logo = null;
    }
  }

  const ctx: ContextoPdf = {
    doc,
    font,
    bold,
    pagina,
    y: A4.height - MARGEN,
    paginas: 1,
    titulo: opciones.titulo,
    folio: opciones.folio ?? '',
    logo,
  };

  dibujarEncabezadoPrincipal(ctx, opciones.subtitulo ?? '');
  return ctx;
}

function dibujarEncabezadoPrincipal(ctx: ContextoPdf, subtitulo: string) {
  const { pagina } = ctx;
  const alto = 74;

  pagina.drawRectangle({
    x: 0,
    y: A4.height - alto,
    width: A4.width,
    height: alto,
    color: COLOR.marca,
  });

  // Logo o marca textual: si el PNG no se pudo incrustar, el documento sigue
  // siendo identificable.
  if (ctx.logo) {
    const escala = 30 / ctx.logo.height;
    const ancho = ctx.logo.width * escala;
    pagina.drawImage(ctx.logo, {
      x: A4.width - MARGEN - ancho,
      y: A4.height - alto + (alto - 30) / 2,
      width: ancho,
      height: 30,
    });
  } else {
    pagina.drawText('ELYX', {
      x: A4.width - MARGEN - 34,
      y: A4.height - alto + 30,
      size: 16,
      font: ctx.bold,
      color: COLOR.blanco,
    });
  }

  pagina.drawText(limpiarTexto(ctx.titulo), {
    x: MARGEN,
    y: A4.height - 34,
    size: 17,
    font: ctx.bold,
    color: COLOR.blanco,
  });

  if (subtitulo) {
    pagina.drawText(limpiarTexto(subtitulo), {
      x: MARGEN,
      y: A4.height - 52,
      size: 9.5,
      font: ctx.font,
      color: rgb(0.9, 0.98, 0.96),
    });
  }

  ctx.y = A4.height - alto - 22;
}

/** Agrega una pagina con un encabezado compacto y reinicia la posicion vertical. */
export function nuevaPagina(ctx: ContextoPdf) {
  ctx.pagina = ctx.doc.addPage([A4.width, A4.height]);
  ctx.paginas += 1;

  ctx.pagina.drawText(limpiarTexto(ctx.titulo), {
    x: MARGEN,
    y: A4.height - MARGEN,
    size: 9,
    font: ctx.bold,
    color: COLOR.marcaOscura,
  });
  ctx.pagina.drawLine({
    start: { x: MARGEN, y: A4.height - MARGEN - 6 },
    end: { x: A4.width - MARGEN, y: A4.height - MARGEN - 6 },
    thickness: 0.8,
    color: COLOR.linea,
  });

  ctx.y = A4.height - MARGEN - 24;
}

/** Salta de pagina si no hay espacio para `altura` puntos. */
export function asegurarEspacio(ctx: ContextoPdf, altura: number) {
  if (ctx.y - altura < MARGEN + PIE_ALTO) {
    nuevaPagina(ctx);
  }
}

/**
 * Dibuja texto y avanza el cursor lo consumido.
 *
 * `drawText` posiciona por la LINEA BASE, no por el borde superior. Dibujar en
 * `ctx.y` hacia que los glifos subieran por encima del cursor y se encimaran
 * con lo ya escrito (titulos sobre tablas, notas sobre leyendas). Aqui la base
 * se coloca dentro del renglon y `ctx.y` queda siempre en el borde inferior.
 *
 * Si el texto no cabe en `maxWidth` se **envuelve**; nunca se recorta con
 * puntos suspensivos, porque un recibo truncado deja de ser verificable.
 */
export function texto(
  ctx: ContextoPdf,
  valor: string,
  opciones: {
    x?: number;
    size?: number;
    bold?: boolean;
    color?: RGB;
    maxWidth?: number;
  } = {},
): number {
  const size = opciones.size ?? 10;
  const font = opciones.bold ? ctx.bold : ctx.font;
  const ancho = opciones.maxWidth ?? ANCHO_UTIL;
  const altoLinea = size + 3;
  const lineas = lineasDeTexto(font, valor, size, ancho);

  for (const linea of lineas) {
    asegurarEspacio(ctx, altoLinea);
    ctx.pagina.drawText(linea, {
      x: opciones.x ?? MARGEN,
      y: ctx.y - size,
      size,
      font,
      color: opciones.color ?? COLOR.tinta,
    });
    ctx.y -= altoLinea;
  }

  return lineas.length * altoLinea;
}

/** Divide un texto en lineas que caben en `ancho`. */
export function lineasDeTexto(
  font: PDFFont,
  valor: string,
  size: number,
  ancho: number,
): string[] {
  const palabras = limpiarTexto(valor).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) {
    return [''];
  }

  const lineas: string[] = [];
  let actual = '';

  for (const palabra of palabras) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(candidato, size) <= ancho) {
      actual = candidato;
      continue;
    }

    if (actual) {
      lineas.push(actual);
      actual = '';
    }

    if (font.widthOfTextAtSize(palabra, size) <= ancho) {
      actual = palabra;
      continue;
    }

    // Palabra mas ancha que la columna (referencias, tokens, URLs): se parte
    // por caracteres en varias lineas. Antes se recortaba con "..." y el dato
    // dejaba de poder cotejarse.
    const trozos = partirPalabra(font, palabra, size, ancho);
    for (let indice = 0; indice < trozos.length - 1; indice += 1) {
      lineas.push(trozos[indice]);
    }
    actual = trozos[trozos.length - 1] ?? '';
  }

  if (actual) {
    lineas.push(actual);
  }

  return lineas.length > 0 ? lineas : [''];
}

/** Corta una palabra larga en trozos que caben en `ancho`, sin perder texto. */
function partirPalabra(
  font: PDFFont,
  palabra: string,
  size: number,
  ancho: number,
): string[] {
  const trozos: string[] = [];
  let actual = '';

  for (const caracter of palabra) {
    const candidato = `${actual}${caracter}`;
    if (actual && font.widthOfTextAtSize(candidato, size) > ancho) {
      trozos.push(actual);
      actual = caracter;
    } else {
      actual = candidato;
    }
  }

  if (actual) {
    trozos.push(actual);
  }

  return trozos.length > 0 ? trozos : [''];
}

function recortar(font: PDFFont, valor: string, size: number, ancho: number): string {
  if (font.widthOfTextAtSize(valor, size) <= ancho) {
    return valor;
  }
  let recortado = valor;
  while (recortado.length > 1 && font.widthOfTextAtSize(`${recortado}...`, size) > ancho) {
    recortado = recortado.slice(0, -1);
  }
  return `${recortado}...`;
}

/** Titulo de seccion con linea inferior. */
export function seccion(ctx: ContextoPdf, titulo: string) {
  const size = 11.5;
  // Aire arriba: sin el, el titulo arrancaba justo donde terminaba la tabla o
  // la leyenda anterior y se veia encimado.
  const separacion = 14;
  const altoSeccion = separacion + size + 18;

  asegurarEspacio(ctx, altoSeccion + 20);

  ctx.y -= separacion;
  ctx.pagina.drawText(limpiarTexto(titulo), {
    x: MARGEN,
    y: ctx.y - size,
    size,
    font: ctx.bold,
    color: COLOR.marcaOscura,
  });

  const lineaY = ctx.y - size - 5;
  ctx.pagina.drawLine({
    start: { x: MARGEN, y: lineaY },
    end: { x: A4.width - MARGEN, y: lineaY },
    thickness: 1,
    color: COLOR.acento,
  });

  ctx.y = lineaY - 14;
}

export type ColumnaTabla = {
  titulo: string;
  ancho: number;
  alinear?: 'izquierda' | 'derecha';
};

/**
 * Tabla con encabezado repetido en cada pagina y filas alternas.
 *
 * Devuelve cuantas filas se dibujaron, para que el llamador pueda anotar
 * "detalle completo en Excel" cuando recorte el listado.
 */
export function tabla(
  ctx: ContextoPdf,
  columnas: ColumnaTabla[],
  filas: string[][],
  opciones: { size?: number; maxFilas?: number } = {},
): number {
  const size = opciones.size ?? 8.5;
  const altoLinea = size + 3;
  const padding = 4;
  const maxFilas = opciones.maxFilas ?? filas.length;
  const visibles = filas.slice(0, maxFilas);

  const dibujarEncabezado = () => {
    const alto = size + 10;
    ctx.pagina.drawRectangle({
      x: MARGEN,
      y: ctx.y - alto,
      width: ANCHO_UTIL,
      height: alto,
      color: COLOR.fondo,
    });
    let x = MARGEN + padding;
    for (const columna of columnas) {
      const etiqueta = limpiarTexto(columna.titulo);
      const anchoTexto = ctx.bold.widthOfTextAtSize(etiqueta, size);
      ctx.pagina.drawText(etiqueta, {
        x: columna.alinear === 'derecha' ? x + columna.ancho - padding * 2 - anchoTexto : x,
        y: ctx.y - alto + (alto - size) / 2,
        size,
        font: ctx.bold,
        color: COLOR.tintaSuave,
      });
      x += columna.ancho;
    }
    ctx.y -= alto;
  };

  asegurarEspacio(ctx, 44);
  dibujarEncabezado();

  let dibujadas = 0;
  for (let indice = 0; indice < visibles.length; indice += 1) {
    const fila = visibles[indice];
    // Altura segun la celda mas alta (texto envuelto).
    const lineasPorCelda = fila.map((celda, columna) =>
      lineasDeTexto(ctx.font, celda ?? '', size, (columnas[columna]?.ancho ?? 60) - padding * 2),
    );
    const maxLineas = lineasPorCelda.reduce((max, lineas) => Math.max(max, lineas.length), 1);
    const altoFila = maxLineas * altoLinea + padding;

    if (ctx.y - altoFila < MARGEN + PIE_ALTO) {
      nuevaPagina(ctx);
      dibujarEncabezado();
    }

    if (indice % 2 === 1) {
      ctx.pagina.drawRectangle({
        x: MARGEN,
        y: ctx.y - altoFila,
        width: ANCHO_UTIL,
        height: altoFila,
        color: COLOR.fondoSuave,
      });
    }

    let x = MARGEN + padding;
    for (let columna = 0; columna < columnas.length; columna += 1) {
      const definicion = columnas[columna];
      const lineas = lineasPorCelda[columna] ?? [''];
      for (let linea = 0; linea < lineas.length; linea += 1) {
        const textoLinea = lineas[linea];
        const anchoTexto = ctx.font.widthOfTextAtSize(textoLinea, size);
        ctx.pagina.drawText(textoLinea, {
          x:
            definicion.alinear === 'derecha'
              ? x + definicion.ancho - padding * 2 - anchoTexto
              : x,
          y: ctx.y - 3 - size - linea * altoLinea,
          size,
          font: ctx.font,
          color: COLOR.tinta,
        });
      }
      x += definicion.ancho;
    }

    ctx.pagina.drawLine({
      start: { x: MARGEN, y: ctx.y - altoFila },
      end: { x: A4.width - MARGEN, y: ctx.y - altoFila },
      thickness: 0.4,
      color: COLOR.linea,
    });

    ctx.y -= altoFila;
    dibujadas += 1;
  }

  ctx.y -= 8;
  return dibujadas;
}

export type KpiPdf = { etiqueta: string; valor: string; nota?: string; alerta?: boolean };

/** Tarjetas de indicadores en una cuadricula de 3 columnas. */
export function kpis(ctx: ContextoPdf, tarjetas: KpiPdf[]) {
  const porFila = 3;
  const ancho = (ANCHO_UTIL - 12 * (porFila - 1)) / porFila;
  const alto = 54;

  for (let indice = 0; indice < tarjetas.length; indice += porFila) {
    const fila = tarjetas.slice(indice, indice + porFila);
    asegurarEspacio(ctx, alto + 8);

    fila.forEach((tarjeta, posicion) => {
      const x = MARGEN + posicion * (ancho + 12);
      ctx.pagina.drawRectangle({
        x,
        y: ctx.y - alto,
        width: ancho,
        height: alto,
        color: COLOR.fondoSuave,
        borderColor: COLOR.linea,
        borderWidth: 0.6,
      });
      ctx.pagina.drawText(limpiarTexto(tarjeta.etiqueta), {
        x: x + 8,
        y: ctx.y - 14,
        size: 7.5,
        font: ctx.font,
        color: COLOR.tintaSuave,
      });
      ctx.pagina.drawText(limpiarTexto(tarjeta.valor), {
        x: x + 8,
        y: ctx.y - 28,
        size: 12.5,
        font: ctx.bold,
        color: tarjeta.alerta ? COLOR.peligro : COLOR.marcaOscura,
      });
      if (tarjeta.nota) {
        // Hasta dos lineas: una nota como "$1,234,567.00 capital + $89,000.00
        // recargos" no cabe en una sola y antes se recortaba con "...".
        const notas = lineasDeTexto(ctx.font, tarjeta.nota, 7, ancho - 16).slice(0, 2);
        notas.forEach((linea, indice) => {
          ctx.pagina.drawText(linea, {
            x: x + 8,
            y: ctx.y - 39 - indice * 9,
            size: 7,
            font: ctx.font,
            color: COLOR.tintaSuave,
          });
        });
      }
    });

    ctx.y -= alto + 8;
  }

  ctx.y -= 4;
}

export type FilaBarras = {
  etiqueta: string;
  segmentos: Array<{ valor: number; color: RGB }>;
  /** Texto que se escribe al final de la barra; por defecto, el total. */
  valorTexto?: string;
};

/**
 * Barras horizontales (o apiladas) con etiqueta a la izquierda.
 *
 * Es la forma mas legible en PDF para muchas categorias o unidades: una
 * grafica vertical con 30 etiquetas obliga a rotar el texto y se vuelve ilegible.
 */
export function barrasHorizontales(
  ctx: ContextoPdf,
  filas: FilaBarras[],
  opciones: { anchoEtiqueta?: number; altoFila?: number; size?: number } = {},
) {
  if (filas.length === 0) {
    texto(ctx, 'Sin datos para graficar.', { size: 9, color: COLOR.tintaSuave });
    ctx.y -= 2;
    return;
  }

  const anchoEtiqueta = opciones.anchoEtiqueta ?? 110;
  const altoBase = opciones.altoFila ?? 18;
  const size = opciones.size ?? 8;
  const anchoBarra = ANCHO_UTIL - anchoEtiqueta - 68;
  const maximo = Math.max(
    1,
    ...filas.map((fila) => fila.segmentos.reduce((suma, seg) => suma + seg.valor, 0)),
  );

  for (const fila of filas) {
    // La etiqueta puede ser "A-302 · Maria Fernanda Gonzalez". Se envuelve en
    // hasta dos lineas en vez de recortarla: el nombre del ocupante es parte
    // del dato con el que el administrador cobra.
    const lineasEtiqueta = lineasDeTexto(
      ctx.font,
      fila.etiqueta,
      size,
      anchoEtiqueta - 6,
    ).slice(0, 2);
    const altoFila = Math.max(altoBase, lineasEtiqueta.length * (size + 3) + 6);

    asegurarEspacio(ctx, altoFila + 2);

    lineasEtiqueta.forEach((linea, indice) => {
      ctx.pagina.drawText(linea, {
        x: MARGEN,
        y: ctx.y - size - 2 - indice * (size + 3),
        size,
        font: ctx.font,
        color: COLOR.tinta,
      });
    });

    const centroBarra = ctx.y - altoFila / 2;

    let x = MARGEN + anchoEtiqueta;
    for (const segmento of fila.segmentos) {
      const ancho = maximo > 0 ? (segmento.valor / maximo) * anchoBarra : 0;
      if (ancho <= 0) {
        continue;
      }
      ctx.pagina.drawRectangle({
        x,
        y: centroBarra - (altoFila - 8) / 2,
        width: Math.max(0.5, ancho),
        height: altoFila - 8,
        color: segmento.color,
      });
      x += ancho;
    }

    const valor = fila.valorTexto ?? '';
    if (valor) {
      ctx.pagina.drawText(limpiarTexto(valor), {
        x: MARGEN + anchoEtiqueta + anchoBarra + 6,
        y: centroBarra - size / 2,
        size,
        font: ctx.font,
        color: COLOR.tintaSuave,
      });
    }

    ctx.y -= altoFila;
  }

  ctx.y -= 6;
}

/**
 * Barras comparadas: varias barras finas por fila, una arriba de otra.
 *
 * Se usa para la tendencia (ingresos vs gastos por periodo). Apilarlas seria
 * incorrecto —no son partes de un mismo total— y dibujarlas en columnas
 * obligaria a rotar las etiquetas.
 */
export function barrasComparadas(
  ctx: ContextoPdf,
  filas: Array<{
    etiqueta: string;
    valores: Array<{ valor: number; color: RGB; etiqueta: string }>;
  }>,
  opciones: { anchoEtiqueta?: number; size?: number } = {},
) {
  if (filas.length === 0) {
    texto(ctx, 'Sin datos para graficar.', { size: 9, color: COLOR.tintaSuave });
    ctx.y -= 2;
    return;
  }

  const anchoEtiqueta = opciones.anchoEtiqueta ?? 96;
  const size = opciones.size ?? 7.5;
  const anchoBarra = ANCHO_UTIL - anchoEtiqueta - 62;
  const maximo = Math.max(
    1,
    ...filas.flatMap((fila) => fila.valores.map((valor) => valor.valor)),
  );

  for (const fila of filas) {
    const altoFila = fila.valores.length * 9 + 6;
    asegurarEspacio(ctx, altoFila + 2);

    ctx.pagina.drawText(
      recortar(ctx.font, limpiarTexto(fila.etiqueta), size, anchoEtiqueta - 6),
      {
        x: MARGEN,
        y: ctx.y - altoFila + 6,
        size,
        font: ctx.font,
        color: COLOR.tinta,
      },
    );

    fila.valores.forEach((valor, indice) => {
      const y = ctx.y - 9 - indice * 9;
      const ancho = Math.max(0.5, (valor.valor / maximo) * anchoBarra);
      ctx.pagina.drawRectangle({
        x: MARGEN + anchoEtiqueta,
        y,
        width: ancho,
        height: 5,
        color: valor.color,
      });
      ctx.pagina.drawText(
        recortar(ctx.font, limpiarTexto(valor.etiqueta), 6.5, 58),
        {
          x: MARGEN + anchoEtiqueta + anchoBarra + 5,
          y: y - 0.5,
          size: 6.5,
          font: ctx.font,
          color: COLOR.tintaSuave,
        },
      );
    });

    ctx.y -= altoFila;
  }

  ctx.y -= 6;
}

/** Leyenda de colores. */
export function leyenda(
  ctx: ContextoPdf,
  elementos: Array<{ etiqueta: string; color: RGB }>,
) {
  asegurarEspacio(ctx, 20);
  let x = MARGEN;
  for (const elemento of elementos) {
    ctx.pagina.drawRectangle({
      x,
      y: ctx.y - 9,
      width: 8,
      height: 8,
      color: elemento.color,
    });
    ctx.pagina.drawText(limpiarTexto(elemento.etiqueta), {
      x: x + 12,
      y: ctx.y - 8,
      size: 7.5,
      font: ctx.font,
      color: COLOR.tintaSuave,
    });
    x += 14 + ctx.font.widthOfTextAtSize(limpiarTexto(elemento.etiqueta), 7.5) + 16;
  }
  ctx.y -= 18;
}

/** Parrafo con envoltura. Devuelve la altura consumida. */
export function parrafo(
  ctx: ContextoPdf,
  valor: string,
  opciones: { size?: number; color?: RGB; ancho?: number; bold?: boolean } = {},
): number {
  const size = opciones.size ?? 9;
  const ancho = opciones.ancho ?? ANCHO_UTIL;
  const font = opciones.bold ? ctx.bold : ctx.font;
  const lineas = lineasDeTexto(font, valor, size, ancho);

  for (const linea of lineas) {
    asegurarEspacio(ctx, size + 4);
    ctx.pagina.drawText(linea, {
      x: MARGEN,
      y: ctx.y - size,
      size,
      font,
      color: opciones.color ?? COLOR.tinta,
    });
    ctx.y -= size + 3;
  }

  ctx.y -= 2;
  return lineas.length * (size + 3);
}

/** Pie de pagina en todas las hojas, con folio y numeracion. */
export function finalizar(ctx: ContextoPdf, nota?: string) {
  const paginas = ctx.doc.getPages();

  paginas.forEach((pagina, indice) => {
    pagina.drawLine({
      start: { x: MARGEN, y: PIE_ALTO },
      end: { x: A4.width - MARGEN, y: PIE_ALTO },
      thickness: 0.6,
      color: COLOR.linea,
    });

    const izquierda = nota
      ? limpiarTexto(nota)
      : 'Documento informativo generado por Elyx';
    pagina.drawText(recortar(ctx.font, izquierda, 7, ANCHO_UTIL - 120), {
      x: MARGEN,
      y: PIE_ALTO - 12,
      size: 7,
      font: ctx.font,
      color: COLOR.tintaSuave,
    });

    const derecha = limpiarTexto(
      `Pagina ${indice + 1} de ${paginas.length}${ctx.folio ? `  ·  ${ctx.folio}` : ''}`,
    );
    const ancho = ctx.font.widthOfTextAtSize(derecha, 7);
    pagina.drawText(derecha, {
      x: A4.width - MARGEN - ancho,
      y: PIE_ALTO - 12,
      size: 7,
      font: ctx.font,
      color: COLOR.tintaSuave,
    });
  });
}

/** Genera el PDF y devuelve los bytes listos para descargar. */
export async function guardar(ctx: ContextoPdf): Promise<ArrayBuffer> {
  const bytes = await ctx.doc.save();
  // Copia exacta: `doc.save()` devuelve una vista que puede apuntar a un buffer
  // mas grande, y Blob exige un ArrayBuffer propio.
  const copia = new Uint8Array(bytes.length);
  copia.set(bytes);
  return copia.buffer;
}
