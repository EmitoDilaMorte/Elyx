import { useCallback, useEffect, useState } from 'react';
import {
  invitacionesApi,
  type InvitacionEstadoResponse,
  type SolicitudAlta,
} from '../services/invitaciones.service';

type InvitacionesPanelProps = {
  idCondominio: number;
  idUsuarioCondominio: number | null;
};

type Estado = {
  cargando: boolean;
  datos: InvitacionEstadoResponse | null;
  solicitudes: SolicitudAlta[];
  error: string | null;
};

const ESTADO_LABEL: Record<SolicitudAlta['estado'], string> = {
  PENDIENTE: 'Sin verificar',
  VERIFICADA: 'Lista para revisar',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  EXPIRADA: 'Expirada',
};

/**
 * Panel del administrador: genera el enlace de invitacion, ve el cupo y aprueba
 * o rechaza las solicitudes de alta.
 *
 * El token del enlace no se puede recuperar despues (solo se guarda su hash en
 * el backend), asi que la URL se muestra una sola vez y se ofrece regenerar.
 */
export function InvitacionesPanel({ idCondominio, idUsuarioCondominio }: InvitacionesPanelProps) {
  const [estado, setEstado] = useState<Estado>({
    cargando: true,
    datos: null,
    solicitudes: [],
    error: null,
  });
  const [urlGenerada, setUrlGenerada] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    setEstado((previo) => ({ ...previo, cargando: true, error: null }));
    try {
      const [datos, solicitudes] = await Promise.all([
        invitacionesApi.estado(idCondominio),
        invitacionesApi.solicitudes(idCondominio),
      ]);
      setEstado({ cargando: false, datos, solicitudes, error: null });
    } catch (error) {
      setEstado({
        cargando: false,
        datos: null,
        solicitudes: [],
        error: extraerMensaje(error, 'No fue posible cargar las invitaciones.'),
      });
    }
  }, [idCondominio]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const generar = async () => {
    setTrabajando(true);
    setAviso(null);
    try {
      const resultado = await invitacionesApi.crear(
        idCondominio,
        idUsuarioCondominio ?? undefined,
      );
      setUrlGenerada(resultado.url);
      setAviso('Enlace creado. Copialo ahora: no podras verlo de nuevo, solo regenerarlo.');
      await refrescar();
    } catch (error) {
      setAviso(extraerMensaje(error, 'No fue posible generar el enlace.'));
    } finally {
      setTrabajando(false);
    }
  };

  const revocar = async () => {
    setTrabajando(true);
    setAviso(null);
    try {
      await invitacionesApi.revocar(idCondominio);
      setUrlGenerada(null);
      setAviso('El enlace quedo desactivado.');
      await refrescar();
    } catch (error) {
      setAviso(extraerMensaje(error, 'No fue posible revocar el enlace.'));
    } finally {
      setTrabajando(false);
    }
  };

  const resolver = async (solicitud: SolicitudAlta, aprobar: boolean) => {
    if (!idUsuarioCondominio) {
      setAviso('No fue posible identificar tu membresia en este condominio.');
      return;
    }

    setTrabajando(true);
    setAviso(null);
    try {
      const payload = {
        idSolicitud: solicitud.idSolicitud,
        idUsuarioCondominioAdmin: idUsuarioCondominio,
      };
      if (aprobar) {
        await invitacionesApi.aprobar(payload);
      } else {
        await invitacionesApi.rechazar(payload);
      }
      setAviso(
        aprobar
          ? `Solicitud de ${solicitud.nombre} aprobada.`
          : `Solicitud de ${solicitud.nombre} rechazada.`,
      );
      await refrescar();
    } catch (error) {
      setAviso(extraerMensaje(error, 'No fue posible resolver la solicitud.'));
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async () => {
    if (!urlGenerada) {
      return;
    }
    try {
      await navigator.clipboard.writeText(urlGenerada);
      setAviso('Enlace copiado al portapapeles.');
    } catch {
      setAviso('Copia el enlace manualmente desde el campo de texto.');
    }
  };

  if (estado.cargando && !estado.datos) {
    return (
      <section className="panel">
        <h4>Invitaciones</h4>
        <p className="muted-text">Cargando...</p>
      </section>
    );
  }

  if (estado.error) {
    return (
      <section className="panel">
        <h4>Invitaciones</h4>
        <div className="login-error">{estado.error}</div>
        <div className="btn-row">
          <button type="button" className="soft-btn" onClick={() => void refrescar()}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  const datos = estado.datos;
  const cupo = datos?.cupo;

  return (
    <section className="grid-cards">
      <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
        <h4>Enlace de invitacion</h4>
        <p className="helper-text" style={{ marginTop: 0 }}>
          Comparte este enlace con tus condominos. Cada uno envia su solicitud, confirma su correo y
          tu la apruebas.
        </p>

        {cupo && (
          <div className="datos-fila">
            <div className="dato">
              <span className="dato-etiqueta">Unidades totales</span>
              <span className="dato-valor">{cupo.unidadesTotales}</span>
            </div>
            <div className="dato">
              <span className="dato-etiqueta">Ocupadas</span>
              <span className="dato-valor">{cupo.unidadesOcupadas}</span>
            </div>
            <div className="dato">
              <span className="dato-etiqueta">Libres</span>
              <span className="dato-valor">{cupo.unidadesLibres}</span>
            </div>
            <div className="dato">
              <span className="dato-etiqueta">Solicitudes por revisar</span>
              <span className="dato-valor">{datos?.solicitudesPendientes ?? 0}</span>
            </div>
          </div>
        )}

        {/* Estado vacio accionable: es la explicacion de que hacer a continuacion. */}
        {!datos?.invitacion && !urlGenerada && (
          <div className="reminder-box">
            <strong className="reminder-title">
              {datos?.puedeInvitar
                ? 'Aun no has generado el enlace'
                : 'No quedan unidades libres'}
            </strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {datos?.puedeInvitar
                ? `Tienes ${cupo?.unidadesLibres ?? 0} unidades libres. Genera el enlace y compartelo: se desactiva solo cuando se ocupen todas.`
                : 'Todas las unidades del condominio ya tienen ocupante. El enlace solo puede generarse cuando hay asientos disponibles.'}
            </p>
          </div>
        )}

        {urlGenerada && (
          <label className="field-label" htmlFor="invitacion-url">
            Enlace para compartir (copialo ahora, no se vuelve a mostrar)
            <input id="invitacion-url" readOnly value={urlGenerada} onFocus={(e) => e.target.select()} />
          </label>
        )}

        <div className="btn-row">
          <button
            type="button"
            className="primary-btn"
            onClick={() => void generar()}
            disabled={trabajando || !datos?.puedeInvitar}
          >
            {datos?.invitacion ? 'Regenerar enlace' : 'Generar enlace'}
          </button>

          {urlGenerada && (
            <button type="button" className="soft-btn" onClick={() => void copiar()}>
              Copiar
            </button>
          )}

          {datos?.invitacion && (
            <button type="button" className="soft-btn" onClick={() => void revocar()} disabled={trabajando}>
              Desactivar enlace
            </button>
          )}
        </div>

        {datos?.invitacion && (
          <p className="muted-text">
            Enlace activo hasta el {formatearFecha(datos.invitacion.expiracion)}. Se desactiva solo al
            ocuparse todas las unidades o si lo desactivas manualmente.
          </p>
        )}

        {aviso && <div className="reminder-box">{aviso}</div>}
      </article>

      <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
        <h4>Solicitudes de alta</h4>

        {estado.solicitudes.length === 0 ? (
          <p className="muted-text">
            Todavia no hay solicitudes. Apareceran aqui en cuanto un condomino use el enlace y
            confirme su correo.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Correo</th>
                  <th>Unidad</th>
                  <th>Ocupacion</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {estado.solicitudes.map((solicitud) => (
                  <tr key={solicitud.idSolicitud}>
                    <td>
                      {solicitud.nombre} {solicitud.apellidoPaterno}
                      {solicitud.apellidoMaterno ? ` ${solicitud.apellidoMaterno}` : ''}
                    </td>
                    <td>
                      {solicitud.correo}
                      {solicitud.esCuentaExistente && (
                        <small className="muted-text"> (cuenta existente)</small>
                      )}
                    </td>
                    <td>{solicitud.claveUnidad ?? solicitud.idUnidadPropuesta}</td>
                    <td>{solicitud.tipoOcupacion}</td>
                    <td>
                      <span className={`status-pill status-${solicitud.estado.toLowerCase()}`}>
                        {ESTADO_LABEL[solicitud.estado]}
                      </span>
                    </td>
                    <td>
                      {solicitud.estado === 'VERIFICADA' && (
                        <div className="btn-row">
                          <button
                            type="button"
                            className="primary-btn compact-btn"
                            onClick={() => void resolver(solicitud, true)}
                            disabled={trabajando}
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            className="soft-btn compact-btn"
                            onClick={() => void resolver(solicitud, false)}
                            disabled={trabajando}
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                      {solicitud.estado === 'PENDIENTE' && (
                        <small className="muted-text">Esperando confirmacion de correo</small>
                      )}
                      {solicitud.estado === 'RECHAZADA' && solicitud.motivoRechazo && (
                        <small className="muted-text">{solicitud.motivoRechazo}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
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
