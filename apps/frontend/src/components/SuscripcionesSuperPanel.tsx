import { useCallback, useEffect, useState } from 'react';
import {
  suscripcionesApi,
  type PagoSuscripcion,
  type Suscripcion,
} from '../services/suscripciones.service';

const ETIQUETA_ESTADO: Record<Suscripcion['estado'], string> = {
  PENDIENTE: 'Pendiente',
  ACTIVA: 'Activa',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
};

/**
 * Listado de suscripciones de la plataforma. El superusuario confirma los pagos
 * hechos por transferencia (proveedor MANUAL) y puede activar, vencer o
 * cancelar una suscripcion.
 */
export function SuscripcionesSuperPanel() {
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<{ id: number; pagos: PagoSuscripcion[] } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setSuscripciones(await suscripcionesApi.listar());
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible cargar las suscripciones.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const confirmar = async (suscripcion: Suscripcion) => {
    setTrabajando(suscripcion.idSuscripcion);
    setAviso(null);
    try {
      await suscripcionesApi.confirmarPago(suscripcion.idSuscripcion, {
        referencia: suscripcion.referenciaPago ?? undefined,
        metodo: 'TRANSFERENCIA',
      });
      setAviso(`Pago confirmado: ${suscripcion.nombreCondominio} quedo ACTIVO.`);
      await cargar();
    } catch (err) {
      setAviso(extraerMensaje(err, 'No fue posible confirmar el pago.'));
    } finally {
      setTrabajando(null);
    }
  };

  const cambiarEstado = async (
    suscripcion: Suscripcion,
    estado: 'ACTIVA' | 'VENCIDA' | 'CANCELADA',
  ) => {
    setTrabajando(suscripcion.idSuscripcion);
    setAviso(null);
    try {
      await suscripcionesApi.cambiarEstado(suscripcion.idSuscripcion, estado);
      setAviso(`Suscripcion de ${suscripcion.nombreCondominio} marcada como ${estado}.`);
      await cargar();
    } catch (err) {
      setAviso(extraerMensaje(err, 'No fue posible cambiar el estado.'));
    } finally {
      setTrabajando(null);
    }
  };

  const verPagos = async (suscripcion: Suscripcion) => {
    if (detalle?.id === suscripcion.idSuscripcion) {
      setDetalle(null);
      return;
    }
    try {
      const pagos = await suscripcionesApi.pagos(suscripcion.idSuscripcion);
      setDetalle({ id: suscripcion.idSuscripcion, pagos });
    } catch (err) {
      setAviso(extraerMensaje(err, 'No fue posible cargar los pagos.'));
    }
  };

  return (
    <section className="panel animate-in">
      <div className="super-header">
        <div>
          <h3>Suscripciones de la plataforma</h3>
          <p className="helper-text">
            Confirma los pagos recibidos por transferencia. Al confirmar, el condominio pasa a ACTIVO
            y el administrador recibe la notificacion.
          </p>
        </div>
        <button className="soft-btn" type="button" onClick={() => void cargar()}>
          Actualizar
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}
      {aviso && <div className="reminder-box">{aviso}</div>}

      {cargando ? (
        <p className="muted-text">Cargando...</p>
      ) : suscripciones.length === 0 ? (
        <p className="muted-text">
          No hay suscripciones registradas. Solo se crean cuando <code>SUSCRIPCION_ENABLED=true</code>.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Condominio</th>
                <th>Estado</th>
                <th>Unidades</th>
                <th>Monto</th>
                <th>Referencia</th>
                <th>Vence</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {suscripciones.map((suscripcion) => (
                <tr key={suscripcion.idSuscripcion}>
                  <td>{suscripcion.nombreCondominio}</td>
                  <td>
                    <span className={`status-pill status-${suscripcion.estado.toLowerCase()}`}>
                      {ETIQUETA_ESTADO[suscripcion.estado]}
                    </span>
                  </td>
                  <td>{suscripcion.cupoUnidades ?? 'Sin limite'}</td>
                  <td>
                    ${suscripcion.monto} {suscripcion.moneda}
                  </td>
                  <td>{suscripcion.referenciaPago ?? '—'}</td>
                  <td>{suscripcion.fechaFin ? formatearFecha(suscripcion.fechaFin) : '—'}</td>
                  <td>
                    <div className="btn-row">
                      {suscripcion.estado !== 'ACTIVA' && (
                        <button
                          type="button"
                          className="primary-btn compact-btn"
                          onClick={() => void confirmar(suscripcion)}
                          disabled={trabajando === suscripcion.idSuscripcion}
                        >
                          Confirmar pago
                        </button>
                      )}
                      {suscripcion.estado === 'ACTIVA' && (
                        <button
                          type="button"
                          className="soft-btn compact-btn"
                          onClick={() => void cambiarEstado(suscripcion, 'VENCIDA')}
                          disabled={trabajando === suscripcion.idSuscripcion}
                        >
                          Marcar vencida
                        </button>
                      )}
                      <button
                        type="button"
                        className="soft-btn compact-btn"
                        onClick={() => void verPagos(suscripcion)}
                      >
                        {detalle?.id === suscripcion.idSuscripcion ? 'Ocultar pagos' : 'Ver pagos'}
                      </button>
                    </div>

                    {detalle?.id === suscripcion.idSuscripcion && (
                      <div className="super-block" style={{ marginTop: '0.6rem' }}>
                        {detalle.pagos.length === 0 ? (
                          <p className="muted-text">Sin pagos registrados.</p>
                        ) : (
                          <ul className="clean-list">
                            {detalle.pagos.map((pago) => (
                              <li key={pago.idPagoSuscripcion}>
                                ${pago.monto} {pago.moneda} · {pago.estado} ·{' '}
                                <small>{formatearFecha(pago.fecha)}</small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function extraerMensaje(error: unknown, porDefecto: string): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  const inicioJson = mensaje.indexOf('{');
  if (inicioJson >= 0) {
    try {
      const data = JSON.parse(mensaje.slice(inicioJson)) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        return data.message.join(' ');
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
    } catch {
      /* se usa el mensaje crudo */
    }
  }
  return mensaje || porDefecto;
}
