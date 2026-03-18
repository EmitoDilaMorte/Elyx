import type { ChangeEvent } from 'react';
import type { Condominio } from '../types/app';

type CondominioSwitcherProps = {
  condominios: Condominio[];
  activeCondominioId: number;
  onChange: (condominioId: number) => void;
};

export function CondominioSwitcher({ condominios, activeCondominioId, onChange }: CondominioSwitcherProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(event.target.value));
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
        {condominios.map((condominio) => (
          <option key={condominio.idCondominio} value={condominio.idCondominio}>
            {condominio.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
