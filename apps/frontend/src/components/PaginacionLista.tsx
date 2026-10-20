import type { MetaPaginacion } from '../services/backendApi.service';

type PaginacionListaProps = {
  meta: MetaPaginacion | null;
  /** Construye el `href` real de cada pagina (misma ruta, distinto `page`). */
  urlPagina: (numero: number) => string;
  irPagina: (numero: number) => void;
  /** Texto del resumen: "12 cuota(s) · pagina 1 de 3". */
  etiquetaResumen: string;
  ariaLabel: string;
};

/** Paginacion con enlaces reales (`<a href>` + `rel="next"`), no solo botones. */
export function PaginacionLista({
  meta,
  urlPagina,
  irPagina,
  etiquetaResumen,
  ariaLabel,
}: PaginacionListaProps) {
  if (!meta) {
    return null;
  }

  const irA = (evento: React.MouseEvent<HTMLAnchorElement>, numero: number) => {
    evento.preventDefault();
    irPagina(numero);
  };

  return (
    <>
      {meta.totalPages > 1 && (
        <nav
          className="btn-row paginacion"
          aria-label={ariaLabel}
          style={{ marginTop: '0.9rem', flexWrap: 'wrap' }}
        >
          {meta.page > 1 && (
            <a
              className="soft-btn compact-btn"
              href={urlPagina(meta.page - 1)}
              onClick={(evento) => irA(evento, meta.page - 1)}
            >
              Anterior
            </a>
          )}

          {Array.from({ length: meta.totalPages }, (_, indice) => indice + 1).map((numero) => (
            <a
              key={numero}
              className="soft-btn compact-btn"
              href={urlPagina(numero)}
              aria-current={numero === meta.page ? 'page' : undefined}
              style={numero === meta.page ? { fontWeight: 700, textDecoration: 'underline' } : undefined}
              onClick={(evento) => irA(evento, numero)}
            >
              {numero}
            </a>
          ))}

          {meta.page < meta.totalPages && (
            <a
              className="soft-btn compact-btn"
              rel="next"
              href={urlPagina(meta.page + 1)}
              onClick={(evento) => irA(evento, meta.page + 1)}
            >
              Siguiente
            </a>
          )}
        </nav>
      )}

      <p className="helper-text" style={{ marginTop: '0.6rem' }}>
        {meta.total} {etiquetaResumen} · pagina {meta.page} de {meta.totalPages}
      </p>
    </>
  );
}
