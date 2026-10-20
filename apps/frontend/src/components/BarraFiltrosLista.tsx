import { useEffect, useState } from 'react';

export type OpcionLista = {
  value: string;
  label: string;
};

type BarraFiltrosListaProps = {
  /** Prefijo de los ids (`cuotas` -> `cuotas-q`, `cuotas-orden`). */
  idPrefijo: string;
  q: string;
  estados: string[];
  orden: string;
  opcionesEstado: OpcionLista[];
  opcionesOrden: OpcionLista[];
  placeholderBusqueda: string;
  etiquetaOrden?: string;
  onBuscar: (valor: string) => void;
  onAlternarEstado: (valor: string, activo: boolean) => void;
  onCambiarOrden: (valor: string) => void;
};

/**
 * Barra de busqueda + filtros + orden de un listado paginado.
 *
 * Mantiene `name` e `id` estables para que un navegador automatizado pueda
 * localizar los controles sin depender del texto visible.
 */
export function BarraFiltrosLista({
  idPrefijo,
  q,
  estados,
  orden,
  opcionesEstado,
  opcionesOrden,
  placeholderBusqueda,
  etiquetaOrden = 'Ordenar',
  onBuscar,
  onAlternarEstado,
  onCambiarOrden,
}: BarraFiltrosListaProps) {
  const [busqueda, setBusqueda] = useState(q);

  useEffect(() => {
    setBusqueda(q);
  }, [q]);

  return (
    <>
      <form
        role="search"
        className="btn-row"
        style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}
        onSubmit={(evento) => {
          evento.preventDefault();
          onBuscar(busqueda.trim());
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <label className="field-label" htmlFor={`${idPrefijo}-q`}>
            Buscar
          </label>
          <input
            id={`${idPrefijo}-q`}
            type="search"
            name="q"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder={placeholderBusqueda}
          />
        </div>
        <button className="primary-btn" type="submit">
          Buscar
        </button>
      </form>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '0.75rem',
        }}
      >
        <span className="field-label" style={{ margin: 0 }}>
          Estado
        </span>
        {opcionesEstado.map((opcion) => (
          <label
            key={opcion.value}
            className="helper-text"
            style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}
          >
            <input
              type="checkbox"
              name="estado"
              value={opcion.value}
              checked={estados.includes(opcion.value)}
              onChange={(evento) => onAlternarEstado(opcion.value, evento.target.checked)}
            />
            {opcion.label}
          </label>
        ))}

        <label className="field-label" htmlFor={`${idPrefijo}-orden`} style={{ margin: 0, marginLeft: 'auto' }}>
          {etiquetaOrden}
        </label>
        <select
          id={`${idPrefijo}-orden`}
          name="orden"
          className="condominio-switcher-select"
          value={orden}
          onChange={(evento) => onCambiarOrden(evento.target.value)}
        >
          {opcionesOrden.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
