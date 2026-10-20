import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

export type CambiosLista = Record<string, string | string[] | null>;

/**
 * Estado de un listado paginado guardado en la URL.
 *
 * La URL es la fuente de verdad (`?page=2&q=...&estado=...&orden=...`): el
 * listado se puede enlazar, recargar y auditar con un navegador automatizado
 * sin depender del estado interno de React.
 */
export function useListaParametros(ordenInicial = 'reciente') {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  // Fuerza el remontaje de las tarjetas en cada carga: asi un navegador
  // automatizado que espera a que el listado anterior quede "stale" detecta el
  // refresco al instante (React reutiliza nodos si la key no cambia).
  const [version, setVersion] = useState(0);

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const q = params.get('q') ?? '';
  const orden = params.get('orden') ?? ordenInicial;
  // `claveEstados` resume el arreglo para no depender de su identidad.
  const claveEstados = params.getAll('estado').join('|');
  const estados = useMemo(
    () => (claveEstados ? claveEstados.split('|') : []),
    [claveEstados],
  );

  const aplicarCambios = (cambios: CambiosLista) => {
    const siguiente = new URLSearchParams(params);

    for (const [clave, valor] of Object.entries(cambios)) {
      siguiente.delete(clave);
      if (Array.isArray(valor)) {
        valor.forEach((item) => siguiente.append(clave, item));
      } else if (valor) {
        siguiente.set(clave, valor);
      }
    }

    siguiente.set('page', '1');
    setParams(siguiente);
  };

  const urlPagina = (numero: number): string => {
    const siguiente = new URLSearchParams(params);
    siguiente.set('page', String(numero));
    const query = siguiente.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const irPagina = (numero: number) => {
    const siguiente = new URLSearchParams(params);
    siguiente.set('page', String(numero));
    setParams(siguiente);
  };

  const marcarCarga = () => setVersion((valor) => valor + 1);

  return {
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
  };
}
