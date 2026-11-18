import { useEffect, useRef, useState } from 'react';

export type NotificacionCampana = {
  idNotificacion: number;
  asunto: string;
  mensaje: string;
  canal: string;
  estado: string;
  fechaProgramada: string;
  /** Canales que tienen entrega registrada (EMAIL / PUSH). */
  canales: string[];
};

type CampanaNotificacionesProps = {
  noLeidas: number;
  items: NotificacionCampana[];
  onMarcarLeida: (idNotificacion: number) => void;
  onMarcarTodas: () => void;
  onVerTodas: () => void;
};

function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }

  const ahora = Date.now();
  const diferencia = ahora - fecha.getTime();
  const minutos = Math.floor(diferencia / 60000);

  if (minutos < 1) {
    return 'Ahora';
  }
  if (minutos < 60) {
    return `Hace ${minutos} min`;
  }

  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    return `Hace ${horas} h`;
  }

  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function etiquetaCanales(canales: string[]): string {
  const nombres: Record<string, string> = {
    EMAIL: 'Correo',
    PUSH: 'Navegador',
  };

  const visibles = canales.filter((canal) => nombres[canal]).map((canal) => nombres[canal]);
  return visibles.length > 0 ? visibles.join(' · ') : 'En la app';
}

/**
 * Campana con el contador de no leidas.
 *
 * Vive en la tarjeta de bienvenida, que se pinta en todas las vistas del panel,
 * asi que la campana siempre esta visible sin importar la seccion.
 *
 * El desplegable se cierra al hacer click fuera o con Escape: sin eso queda
 * tapando el contenido en movil.
 */
export function CampanaNotificaciones({
  noLeidas,
  items,
  onMarcarLeida,
  onMarcarTodas,
  onVerTodas,
}: CampanaNotificacionesProps) {
  const [abierta, setAbierta] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) {
      return;
    }

    const alClicFuera = (event: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(event.target as Node)) {
        setAbierta(false);
      }
    };

    const alEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAbierta(false);
      }
    };

    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alEscape);

    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierta]);

  const contador = noLeidas > 99 ? '99+' : String(noLeidas);

  return (
    <div className="campana-notificaciones" ref={contenedorRef}>
      <button
        type="button"
        className={`campana-btn ${noLeidas > 0 ? 'con-pendientes' : ''}`}
        onClick={() => setAbierta((valor) => !valor)}
        aria-label={
          noLeidas > 0
            ? `Notificaciones: ${noLeidas} sin leer`
            : 'Notificaciones'
        }
        aria-expanded={abierta}
        aria-haspopup="true"
      >
        <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
          <path
            d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a2 2 0 0 0 3 0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        {noLeidas > 0 && (
          <span className="campana-badge" aria-hidden="true">
            {contador}
          </span>
        )}
      </button>

      {abierta && (
        <div className="campana-panel" role="dialog" aria-label="Notificaciones recientes">
          <div className="campana-panel-head">
            <strong>Notificaciones</strong>
            {noLeidas > 0 && (
              <button type="button" className="campana-link" onClick={onMarcarTodas}>
                Marcar todas
              </button>
            )}
          </div>

          <ul className="campana-lista">
            {items.length === 0 && <li className="campana-vacia">No tienes notificaciones.</li>}

            {items.map((item) => (
              <li key={item.idNotificacion} className={item.estado === 'LEIDA' ? 'leida' : ''}>
                <div className="campana-item-head">
                  <strong>{item.asunto}</strong>
                  <small>{fechaCorta(item.fechaProgramada)}</small>
                </div>
                <p className="campana-mensaje">{item.mensaje}</p>
                <div className="campana-item-pie">
                  <span className="campana-canal">{etiquetaCanales(item.canales)}</span>
                  {item.estado !== 'LEIDA' && (
                    <button
                      type="button"
                      className="campana-link"
                      onClick={() => onMarcarLeida(item.idNotificacion)}
                    >
                      Marcar leida
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button type="button" className="campana-ver-todas" onClick={onVerTodas}>
            Ver bandeja completa
          </button>
        </div>
      )}
    </div>
  );
}
