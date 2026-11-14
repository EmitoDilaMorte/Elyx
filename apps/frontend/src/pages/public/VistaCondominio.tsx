import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../../components/TurnstileWidget';
import { backendApi } from '../../services/backendApi.service';
import { invitacionesApi } from '../../services/invitaciones.service';
import {
  type CondominioPublico,
  type ResolucionInvitacion,
} from '../../services/publico.service';
import { PublicLayout } from './PublicLayout';

type VistaCondominioProps = {
  condominio: CondominioPublico;
  /**
   * Estado del enlace de invitacion. `null` cuando se entra por
   * `/condominio/:id` sin token: la seccion de union no se muestra.
   */
  invitacion: ResolucionInvitacion | null;
  /**
   * Token del enlace. Hace falta para el POST de union: el backend resuelve el
   * condominio a partir del token y no de un id del cuerpo, para que no se pueda
   * cambiar de condominio alterando la peticion.
   */
  tokenInvitacion?: string;
};

/**
 * Pagina publica del condominio.
 *
 * Cumple dos funciones a la vez:
 *
 *  1. **URL del negocio para Stripe.** Al crear la cuenta conectada, Stripe
 *     exige una pagina publica con el nombre, la descripcion de los servicios y
 *     datos de contacto de atencion al cliente, y la revisa periodicamente.
 *  2. **Bienvenida al condomino.** Es lo primero que ve quien llega desde un
 *     enlace de invitacion, asi que explica que es Elyx y ofrece unirse.
 *
 * **Solo se muestra lo que Stripe pide y lo minimo para reconocer el
 * condominio.** No aparece la direccion exacta, ni datos del administrador, ni
 * importes: la pagina se sirve sin autenticacion.
 */
export function VistaCondominio({ condominio, invitacion, tokenInvitacion }: VistaCondominioProps) {
  useNoIndex();

  return (
    <PublicLayout
      title={condominio.nombre}
      subtitle="Administración de cuotas condominales"
      wide
    >
      <section className="condo-hero">
        <p className="helper-text" style={{ marginTop: 0 }}>
          {condominio.descripcion}
        </p>
      </section>

      <ContactoCondominio condominio={condominio} />

      <section className="condo-bloque">
        <h3>¿Qué es Elyx?</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Elyx es la plataforma donde el condominio administra sus cuotas: consultas tu estado de
          cuenta, pagas en línea con transferencia o tarjeta, subes tu comprobante y recibes los
          avisos del administrador. El dinero de las cuotas llega directamente a la cuenta del
          condominio; Elyx no lo recibe ni lo retiene.
        </p>
      </section>

      {/* La seccion de union solo existe si se llego con un enlace valido. */}
      {invitacion && tokenInvitacion && (
        <SeccionUnion
          invitacion={invitacion}
          token={tokenInvitacion}
          idCondominio={condominio.idCondominio}
        />
      )}

      <div className="condo-footer">
        <Link to="/politica-pagos" className="link-btn">
          Política de pagos, reembolsos y aclaraciones
        </Link>
      </div>
    </PublicLayout>
  );
}

/**
 * Marca la pagina como `noindex`.
 *
 * `robots.txt` ya la excluye, pero no todos los rastreadores lo respetan y
 * algunos lo ignoran cuando llegan por un enlace externo. La pagina tiene que
 * seguir siendo **accesible sin credenciales** (Stripe la revisa), asi que no se
 * puede proteger con autenticacion: lo unico posible es pedir que no se indexe.
 */
function useNoIndex(): void {
  useEffect(() => {
    const etiqueta = document.createElement('meta');
    etiqueta.name = 'robots';
    etiqueta.content = 'noindex, nofollow';
    document.head.appendChild(etiqueta);

    return () => {
      document.head.removeChild(etiqueta);
    };
  }, []);
}

/** Correo y telefono de atencion: los exige Stripe en la web del negocio. */
function ContactoCondominio({ condominio }: { condominio: CondominioPublico }) {
  if (!condominio.correoContacto && !condominio.telefonoContacto) {
    return (
      <section className="condo-bloque">
        <h3>Atención a condóminos</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          El administrador del condominio aún no publicó sus datos de contacto. Si necesitas
          comunicarte, usa el medio que te haya compartido directamente.
        </p>
      </section>
    );
  }

  return (
    <section className="condo-bloque">
      <h3>Atención a condóminos</h3>
      <ul className="datos-lista" style={{ marginBottom: 0 }}>
        {condominio.correoContacto && (
          <li>
            <span>Correo</span>
            <strong>
              <a href={`mailto:${condominio.correoContacto}`}>{condominio.correoContacto}</a>
            </strong>
          </li>
        )}
        {condominio.telefonoContacto && (
          <li>
            <span>Teléfono</span>
            <strong>
              <a href={`tel:${condominio.telefonoContacto}`}>{condominio.telefonoContacto}</a>
            </strong>
          </li>
        )}
      </ul>
    </section>
  );
}

/**
 * Bloque para unirse al condominio desde un enlace de invitacion.
 *
 * Distingue tres situaciones, porque el mensaje y la accion cambian por
 * completo:
 *  - El enlace no sirve (vencido, revocado, sin cupo): se explica y se ofrece
 *    contactar al administrador. No hay nada que el visitante pueda hacer.
 *  - Hay enlace valido y sesion iniciada de alguien que **ya es miembro**: no
 *    se le ofrece unirse otra vez; se le dice que ya pertenece.
 *  - Hay enlace valido y sesion iniciada: basta un boton para unirse. **No se
 *    vuelve a pedir el correo ni se manda verificacion**: el login ya probo que
 *    el buzon es suyo.
 *  - Hay enlace valido y no hay sesion: se ofrecen las dos puertas. Quien ya
 *    tiene cuenta inicia sesion y su cuenta se reutiliza; quien es nuevo llena
 *    el formulario aqui mismo y recibe un correo de confirmacion.
 */
function SeccionUnion({
  invitacion,
  token,
  idCondominio,
}: {
  invitacion: ResolucionInvitacion;
  token: string;
  idCondominio: number;
}) {
  // `null` = aun comprobando, `false` = sin sesion, `true` = con sesion.
  const [haySesion, setHaySesion] = useState<boolean | null>(null);
  /** `true` si quien tiene sesion ya pertenece al condominio del enlace. */
  const [yaMiembro, setYaMiembro] = useState(false);
  const [uniendose, setUniendose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  /** `true` cuando quien no tiene sesion elige registrarse en vez de entrar. */
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [idUnidad, setIdUnidad] = useState<string>(
    invitacion.unidadesLibres[0] ? String(invitacion.unidadesLibres[0].idUnidad) : '',
  );

  // Se reutiliza la cookie HttpOnly del refresh token para saber si hay sesion.
  // No se muestra el boton de "Unirme" hasta confirmarlo: ofrecerlo a alguien
  // sin sesion solo lo llevaria a un 401.
  useEffect(() => {
    let cancelado = false;
    void backendApi
      .refreshSession()
      .then((sesion) => {
        if (cancelado) {
          return;
        }
        setHaySesion(Boolean(sesion));

        // La sesion ya trae las membresias: si una es de este condominio, el
        // visitante ya pertenece y no hay nada que solicitar. Sin esta
        // comprobacion se le ofrecia "Unirme" a alguien que ya estaba dentro.
        const miembros = sesion?.user?.membresias ?? [];
        setYaMiembro(
          miembros.some(
            (membresia) =>
              Number(membresia.idCondominio) === idCondominio &&
              String(membresia.estado).toUpperCase() === 'ACTIVO',
          ),
        );
      })
      .catch(() => {
        if (!cancelado) {
          setHaySesion(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [idCondominio]);

  // Un miembro actual se reconoce ANTES de mirar el estado del enlace: si su
  // membresia ya existe, un enlace revocado no le impide nada y decirle "no
  // puedes unirte" seria confuso.
  if (yaMiembro) {
    return (
      <section className="condo-bloque condo-bloque-ok">
        <h3>Ya perteneces a este condominio</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Tu cuenta ya está vinculada a este condominio. Entra a Elyx para consultar tus cuotas y
          tu estado de cuenta.
        </p>
        <div className="btn-row">
          <Link className="primary-btn" to="/login">
            Entrar a Elyx
          </Link>
        </div>
      </section>
    );
  }

  if (invitacion.estado !== 'DISPONIBLE') {
    return (
      <section className="condo-bloque condo-bloque-aviso">
        <h3>No puedes unirte con este enlace</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          {invitacion.motivo ?? 'Este enlace de invitación ya no está disponible.'}
        </p>
      </section>
    );
  }

  const unirse = async () => {
    if (!idUnidad) {
      setError('Selecciona la unidad que ocupas.');
      return;
    }

    setUniendose(true);
    setError(null);
    try {
      const resultado = await invitacionesApi.unirseDesdeToken(token, Number(idUnidad));
      // El backend responde `YA_MIEMBRO` cuando la membresia ya existe (por
      // ejemplo, se aprobo en otra pestaña). Se muestra como tal y no como
      // "solicitud enviada", que seria mentira.
      if (resultado.estado === 'YA_MIEMBRO') {
        setYaMiembro(true);
        return;
      }
      setListo(true);
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible enviar tu solicitud. Intenta de nuevo.'));
    } finally {
      setUniendose(false);
    }
  };

  if (listo) {
    return (
      <section className="condo-bloque condo-bloque-ok">
        <h3>Solicitud enviada</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          El administrador revisará tu solicitud y te avisará cuando quede aprobada. No necesitas
          volver a registrarte: tu cuenta queda vinculada a este condominio al aprobarse.
        </p>
      </section>
    );
  }

  return (
    <section className="condo-bloque">
      <h3>Unirte a este condominio</h3>

      {error && <div className="login-error">{error}</div>}

      {haySesion === null && <p className="muted-text">Comprobando tu sesión...</p>}

      {/* Con sesion iniciada solo falta elegir unidad y confirmar. */}
      {haySesion === true && (
        <>
          <div className="form-grid">
            <label className="field-label" htmlFor="unirse-unidad">
              Unidad que ocupas
              <select
                id="unirse-unidad"
                value={idUnidad}
                onChange={(evento) => setIdUnidad(evento.target.value)}
              >
                {invitacion.unidadesLibres.map((unidad) => (
                  <option key={unidad.idUnidad} value={unidad.idUnidad}>
                    {unidad.claveUnidad}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="helper-text">
            Ya iniciaste sesión. Al unirte, este condominio se agrega a tu cuenta actual: no se crea
            una cuenta nueva.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="primary-btn"
              disabled={uniendose}
              onClick={() => void unirse()}
            >
              {uniendose ? 'Enviando...' : 'Unirme a este condominio'}
            </button>
          </div>
        </>
      )}

      {/* Sin sesion: dos caminos. El selector de unidad vive dentro del
          formulario para no duplicarlo en pantalla. */}
      {haySesion === false && (
        <>
          <p className="helper-text">
            Si <strong>ya usaste Elyx</strong> en otro condominio, inicia sesión: tu cuenta se
            reutiliza y no tienes que registrarte de nuevo.
          </p>
          <div className="btn-row">
            <Link className="primary-btn" to={rutaLoginConRetorno(token)}>
              Iniciar sesión
            </Link>
            <button
              type="button"
              className="soft-btn"
              onClick={() => setMostrarFormulario((previo) => !previo)}
            >
              {mostrarFormulario ? 'Ocultar registro' : 'Soy nuevo, registrarme'}
            </button>
          </div>

          {mostrarFormulario && (
            <FormularioAlta
              token={token}
              idUnidad={idUnidad}
              unidades={invitacion.unidadesLibres}
              onIdUnidadChange={setIdUnidad}
              onEnviado={() => setListo(true)}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * URL de login que regresa al enlace de invitacion.
 *
 * El token viaja en el query porque es lo unico que identifica el condominio
 * para quien aun no tiene sesion. Sin esto, el administrador que acaba de
 * iniciar sesion caeria en el panel y perderia la invitacion.
 */
function rutaLoginConRetorno(token: string): string {
  return `/login?volver=${encodeURIComponent(`/invitacion/${token}`)}`;
}

type FormularioAltaProps = {
  token: string;
  idUnidad: string;
  unidades: Array<{ idUnidad: number; claveUnidad: string; tipoUnidad: string }>;
  onIdUnidadChange: (valor: string) => void;
  onEnviado: () => void;
};

/**
 * Alta de un condomino nuevo desde el enlace de invitacion.
 *
 * Se conserva el flujo original (solicitud + correo de confirmacion) porque la
 * cuenta **no se crea al enviar**: se crea cuando el administrador aprueba, y
 * hasta entonces la unica prueba de que el buzon existe es el enlace enviado por
 * correo.
 */
function FormularioAlta({
  token,
  idUnidad,
  unidades,
  onIdUnidadChange,
  onEnviado,
}: FormularioAltaProps) {
  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [tipoOcupacion, setTipoOcupacion] =
    useState<'PROPIETARIO' | 'INQUILINO' | 'HABITANTE'>('PROPIETARIO');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const enviar = async () => {
    if (nombre.trim().length < 2) return setError('Tu nombre es obligatorio.');
    if (apellidoPaterno.trim().length < 2) {
      return setError('Tu apellido paterno es obligatorio.');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) {
      return setError('El correo no es válido.');
    }
    if (!idUnidad) return setError('Selecciona una unidad.');
    if (password.length < 8) {
      return setError('La contraseña debe tener al menos 8 caracteres.');
    }
    if (password !== password2) return setError('Las contraseñas no coinciden.');

    setEnviando(true);
    setError(null);
    try {
      await invitacionesApi.enviarSolicitud(token, {
        nombre: nombre.trim(),
        apellidoPaterno: apellidoPaterno.trim(),
        apellidoMaterno: apellidoMaterno.trim() || undefined,
        correo: correo.trim(),
        telefono: telefono.trim() || undefined,
        idUnidad: Number(idUnidad),
        tipoOcupacion,
        password: password || undefined,
        captchaToken: turnstileRef.current?.getToken() ?? '',
      });
      onEnviado();
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible enviar tu solicitud. Intenta de nuevo.'));
      turnstileRef.current?.reset();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="condo-formulario">
      <div className="form-grid">
        <label className="field-label" htmlFor="alta-nombre">
          Nombre
          <input
            id="alta-nombre"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            maxLength={100}
          />
        </label>

        <label className="field-label" htmlFor="alta-paterno">
          Apellido paterno
          <input
            id="alta-paterno"
            value={apellidoPaterno}
            onChange={(evento) => setApellidoPaterno(evento.target.value)}
            maxLength={80}
          />
        </label>

        <label className="field-label" htmlFor="alta-materno">
          Apellido materno (opcional)
          <input
            id="alta-materno"
            value={apellidoMaterno}
            onChange={(evento) => setApellidoMaterno(evento.target.value)}
            maxLength={80}
          />
        </label>

        <label className="field-label" htmlFor="alta-correo">
          Correo
          <input
            id="alta-correo"
            type="email"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            maxLength={150}
          />
        </label>

        <label className="field-label" htmlFor="alta-telefono">
          Teléfono (opcional)
          <input
            id="alta-telefono"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
            maxLength={30}
          />
        </label>

        <label className="field-label" htmlFor="alta-unidad">
          Unidad
          <select
            id="alta-unidad"
            value={idUnidad}
            onChange={(evento) => onIdUnidadChange(evento.target.value)}
          >
            {unidades.map((unidad) => (
              <option key={unidad.idUnidad} value={unidad.idUnidad}>
                {unidad.claveUnidad}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label" htmlFor="alta-relacion">
          Relación con la unidad
          <select
            id="alta-relacion"
            value={tipoOcupacion}
            onChange={(evento) =>
              setTipoOcupacion(evento.target.value as 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE')
            }
          >
            <option value="PROPIETARIO">Propietario</option>
            <option value="INQUILINO">Inquilino</option>
            <option value="HABITANTE">Habitante</option>
          </select>
        </label>

        <label className="field-label" htmlFor="alta-password">
          Contraseña
          <input
            id="alta-password"
            type="password"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
          />
        </label>

        <label className="field-label" htmlFor="alta-password2">
          Repetir contraseña
          <input
            id="alta-password2"
            type="password"
            value={password2}
            onChange={(evento) => setPassword2(evento.target.value)}
          />
        </label>
      </div>

      {error && <div className="login-error">{error}</div>}

      <TurnstileWidget ref={turnstileRef} action="solicitud_invitacion" />

      <div className="btn-row">
        <button
          type="button"
          className="primary-btn"
          disabled={enviando}
          onClick={() => void enviar()}
        >
          {enviando ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </div>

      <p className="muted-text" style={{ fontSize: '0.82rem', marginBottom: 0 }}>
        Te enviaremos un correo para confirmar tu dirección. Cuando lo confirmes, el administrador
        revisará tu solicitud.
      </p>
    </div>
  );
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
