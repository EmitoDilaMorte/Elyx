import type { ChangeEvent } from 'react';
import type { Condominio, UserMembership } from '../types/app';

type CondominioSwitcherProps = {
  condominios: Condominio[];
  /** Membresias del usuario: permiten mostrar el rol en cada condominio. */
  membresias: UserMembership[];
  activeCondominioId: number;
  onChange: (condominioId: number) => void;
};

/**
 * Selector de condominio activo.
 *
 * En un mismo usuario el rol cambia por condominio (administrador en uno,
 * condomino en otro). Mostrarlo junto al nombre evita que el panel cambie de
 * aspecto sin explicacion al mover el selector.
 */
export function CondominioSwitcher({
  condominios,
  membresias,
  activeCondominioId,
  onChange,
}: CondominioSwitcherProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(event.target.value));
  };

  const rolPorCondominio = new Map(
    membresias
      .filter((item) => item.estado === 'ACTIVO')
      .map((item) => [Number(item.idCondominio), item.rol] as const),
  );

  const etiquetaRol = (idCondominio: number): string | null => {
    const rol = rolPorCondominio.get(Number(idCondominio));
    if (rol === 'administrador') {
      return 'Administrador';
    }
    if (rol === 'condomino') {
      return 'Condómino';
    }
    return null;
  };

  return (
    <div className="condominio-switcher" role="group" aria-label="Selector de condominio activo">
      <label htmlFor="condominio-switcher-select" className="condominio-switcher-label">
        Condominio activo
      </label>
      <select
        id="condominio-switcher-select"
        className="condominio-switcher-select"
        value={activeCondominioId}
        onChange={handleChange}
      >
        {condominios.map((condominio) => {
          const rol = etiquetaRol(condominio.idCondominio);
          return (
            <option key={condominio.idCondominio} value={condominio.idCondominio}>
              {rol ? `${condominio.nombre} — ${rol}` : condominio.nombre}
            </option>
          );
        })}
      </select>
    </div>
  );
}

