import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../../components/TurnstileWidget';
import {
  invitacionesApi,
  type InvitacionPublicaResponse,
} from '../../services/invitaciones.service';
import { PublicLayout } from './PublicLayout';

type FormState = {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  correo: string;
  telefono: string;
  idUnidad: string;
  tipoOcupacion: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE';
  password: string;
  password2: string;
};

const ESTADO_INICIAL: FormState = {
  nombre: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  correo: '',
  telefono: '',
  idUnidad: '',
  tipoOcupacion: 'PROPIETARIO',
  password: '',
  password2: '',
};

export function InvitacionPage() {
  // La app resuelve rutas a mano sobre `useLocation` (no usa <Routes>), asi que
  // `useParams()` siempre devuelve vacio: el token se extrae del pathname.
  const { pathname } = useLocation();
  const token = extraerToken(pathname);
  const [cargando, setCargando] = useState(true);
  const [invitacion, setInvitacion] = useState<InvitacionPublicaResponse | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(ESTADO_INICIAL);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  useEffect(() => {
    // Sin token no se llama a la API: evita un 404 por `/publica/` vacio.
    if (!token) {
      setErrorCarga('El enlace no incluye un token de invitacion.');
      setCargando(false);
      return;
    }

    let cancelado = false;
    void invitacionesApi
      .publica(token)
      .then((data) => {
        if (cancelado) return;
        setInvitacion(data);
        setForm((previo) => ({
          ...previo,
          idUnidad: data.unidadesLibres[0] ? String(data.unidadesLibres[0].idUnidad) : '',
        }));
      })
      .catch((error) => {
        if (!cancelado) setErrorCarga(extraerMensaje(error, 'Este enlace de invitacion ya no esta disponible.'));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [token]);

  const actualizar = (campo: keyof FormState, valor: string) => {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  };

  const enviar = async () => {
    if (form.nombre.trim().length < 2) return setError('Tu nombre es obligatorio.');
    if (form.apellidoPaterno.trim().length < 2) return setError('Tu apellido paterno es obligatorio.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.correo.trim())) return setError('El correo no es valido.');
    if (!form.idUnidad) return setError('Selecciona una unidad.');
    if (form.password && form.password.length < 8) {
      return setError('La contrasena debe tener al menos 8 caracteres.');
    }
    if (form.password !== form.password2) return setError('Las contrasenas no coinciden.');

    setEnviando(true);
    setError(null);

    try {
      await invitacionesApi.enviarSolicitud(token, {
        nombre: form.nombre.trim(),
        apellidoPaterno: form.apellidoPaterno.trim(),
        apellidoMaterno: form.apellidoMaterno.trim() || undefined,
        correo: form.correo.trim(),
        telefono: form.telefono.trim() || undefined,
        idUnidad: Number(form.idUnidad),
        tipoOcupacion: form.tipoOcupacion,
        password: form.password || undefined,
        captchaToken: turnstileRef.current?.getToken() ?? '',
      });
      setEnviado(true);
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible enviar tu solicitud. Intenta de nuevo.'));
      turnstileRef.current?.reset();
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <PublicLayout title="Invitacion a un condominio" subtitle="Cargando...">
        <p className="muted-text">Un momento...</p>
      </PublicLayout>
    );
  }

  if (errorCarga || !invitacion) {
    return (
      <PublicLayout title="Invitacion no disponible">
        <div className="login-error">{errorCarga ?? 'Este enlace ya no esta disponible.'}</div>
        <p className="muted-text">
          El administrador del condominio puede generar un enlace nuevo si aun hay unidades libres.
        </p>
        <div className="btn-row">
          <Link className="primary-btn" to="/login">
            Volver al inicio de sesion
          </Link>
        </div>
      </PublicLayout>
    );
  }

  if (enviado) {
    return (
      <PublicLayout title="Revisa tu correo" subtitle={invitacion.nombreCondominio}>
        <p>
          Enviamos un enlace de confirmacion a <strong>{form.correo}</strong>.
        </p>
        <p className="muted-text">
          Al confirmarlo, tu solicitud pasara a revision del administrador del condominio.
        </p>
      </PublicLayout>
    );
  }

  if (invitacion.unidadesLibres.length === 0) {
    return (
      <PublicLayout title="Sin unidades disponibles" subtitle={invitacion.nombreCondominio}>
        <p className="muted-text">
          Todas las unidades ya estan ocupadas o reservadas. Contacta al administrador del condominio.
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout
      title="Unete al condominio"
      subtitle={invitacion.nombreCondominio}
      wide
      footer={<span className="muted-text">Tu solicitud sera revisada por el administrador.</span>}
    >
      <div className="form-grid">
        <label className="field-label" htmlFor="nombre">
          Nombre
          <input id="nombre" value={form.nombre} onChange={(e) => actualizar('nombre', e.target.value)} maxLength={100} />
        </label>

        <label className="field-label" htmlFor="apellidoPaterno">
          Apellido paterno
          <input
            id="apellidoPaterno"
            value={form.apellidoPaterno}
            onChange={(e) => actualizar('apellidoPaterno', e.target.value)}
            maxLength={80}
          />
        </label>

        <label className="field-label" htmlFor="apellidoMaterno">
          Apellido materno (opcional)
          <input
            id="apellidoMaterno"
            value={form.apellidoMaterno}
            onChange={(e) => actualizar('apellidoMaterno', e.target.value)}
            maxLength={80}
          />
        </label>

        <label className="field-label" htmlFor="correo">
          Correo electronico
          <input
            id="correo"
            type="email"
            value={form.correo}
            onChange={(e) => actualizar('correo', e.target.value)}
            maxLength={150}
          />
        </label>

        <label className="field-label" htmlFor="telefono">
          Telefono (opcional)
          <input
            id="telefono"
            value={form.telefono}
            onChange={(e) => actualizar('telefono', e.target.value)}
            maxLength={30}
          />
        </label>

        <label className="field-label" htmlFor="idUnidad">
          Unidad
          <select
            id="idUnidad"
            value={form.idUnidad}
            onChange={(e) => actualizar('idUnidad', e.target.value)}
          >
            {invitacion.unidadesLibres.map((unidad) => (
              <option key={unidad.idUnidad} value={unidad.idUnidad}>
                {unidad.claveUnidad}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label" htmlFor="tipoOcupacion">
          Tu relacion con la unidad
          <select
            id="tipoOcupacion"
            value={form.tipoOcupacion}
            onChange={(e) => actualizar('tipoOcupacion', e.target.value)}
          >
            <option value="PROPIETARIO">Propietario</option>
            <option value="INQUILINO">Inquilino</option>
            <option value="HABITANTE">Habitante</option>
          </select>
        </label>

        <label className="field-label" htmlFor="password">
          Contrasena
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => actualizar('password', e.target.value)}
            placeholder="Si ya tienes cuenta, dejalo vacio"
          />
        </label>

        <label className="field-label" htmlFor="password2">
          Repite la contrasena
          <input
            id="password2"
            type="password"
            value={form.password2}
            onChange={(e) => actualizar('password2', e.target.value)}
          />
          <small className="muted-text">
            Si tu correo ya esta registrado en Elyx, conservaras tu contrasena actual.
          </small>
        </label>

        <div className="public-captcha">
          <TurnstileWidget ref={turnstileRef} action="solicitud_invitacion" />
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="btn-row">
        <button type="button" className="primary-btn" onClick={enviar} disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </div>
    </PublicLayout>
  );
}

function extraerToken(pathname: string): string {
  const segmentos = pathname.split('/').filter((segmento) => segmento.length > 0);
  // /invitacion/<token> -> el token es el ultimo segmento.
  return segmentos.length >= 2 ? segmentos[segmentos.length - 1] : '';
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
