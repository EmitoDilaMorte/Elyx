import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../../components/TurnstileWidget';
import { registroApi, type RegistroCondominioPayload } from '../../services/registro.service';
import { PublicLayout } from './PublicLayout';

type FormState = {
  nombreCondominio: string;
  direccionCondominio: string;
  numeroUnidades: string;
  prefijoUnidad: string;
  tipoUnidad: RegistroCondominioPayload['tipoUnidad'];
  montoCuota: string;
  recargoPorDia: string;
  diaLimitePago: string;
  nombreAdmin: string;
  apellidoPaternoAdmin: string;
  apellidoMaternoAdmin: string;
  correoAdmin: string;
  telefonoAdmin: string;
  password: string;
  password2: string;
};

const ESTADO_INICIAL: FormState = {
  nombreCondominio: '',
  direccionCondominio: '',
  numeroUnidades: '20',
  prefijoUnidad: 'Depto ',
  tipoUnidad: 'DEPARTAMENTO',
  montoCuota: '1000',
  recargoPorDia: '0',
  diaLimitePago: '10',
  nombreAdmin: '',
  apellidoPaternoAdmin: '',
  apellidoMaternoAdmin: '',
  correoAdmin: '',
  telefonoAdmin: '',
  password: '',
  password2: '',
};

export function CrearCondominioPage() {
  const [form, setForm] = useState<FormState>(ESTADO_INICIAL);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  // `true` solo si la consulta fallo por red o por un 5xx. Distinto de
  // `disponible === false`, que significa que el servidor respondio bien y
  // dijo que las altas estan desactivadas. Mezclarlos hacia que cualquier
  // caida del backend se leyera como "el registro no esta disponible".
  const [sinConexion, setSinConexion] = useState(false);
  const [reintento, setReintento] = useState(0);
  const [suscripcionRequerida, setSuscripcionRequerida] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  useEffect(() => {
    let cancelado = false;
    setSinConexion(false);
    void registroApi.disponibilidad()
      .then((data) => {
        if (!cancelado) {
          setDisponible(data.disponible);
          setSuscripcionRequerida(data.suscripcionRequerida);
        }
      })
      .catch(() => {
        if (!cancelado) {
          // No se sabe si el registro esta activo: se dice la verdad (no hay
          // conexion) en lugar de afirmar algo que no se comprobo.
          setSinConexion(true);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [reintento]);

  const unidadesPrevistas = useMemo(() => {
    const total = Number(form.numeroUnidades);
    if (!Number.isFinite(total) || total <= 0) {
      return [];
    }
    const prefijo = form.prefijoUnidad;
    return [`${prefijo}1`, `${prefijo}2`, '...', `${prefijo}${total}`];
  }, [form.numeroUnidades, form.prefijoUnidad]);

  const actualizar = (campo: keyof FormState, valor: string) => {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  };

  const validarPaso = (numero: 1 | 2 | 3): string | null => {
    if (numero === 1) {
      if (form.nombreCondominio.trim().length < 3) return 'El nombre del condominio es obligatorio.';
      const total = Number(form.numeroUnidades);
      if (!Number.isInteger(total) || total < 1 || total > 2000) {
        return 'Indica entre 1 y 2000 unidades.';
      }
      return null;
    }
    if (numero === 2) {
      const monto = Number(form.montoCuota);
      if (!Number.isFinite(monto) || monto < 0) return 'El monto de la cuota no es valido.';
      const dia = Number(form.diaLimitePago);
      if (!Number.isInteger(dia) || dia < 1 || dia > 28) return 'El dia limite debe estar entre 1 y 28.';
      return null;
    }
    if (form.nombreAdmin.trim().length < 2) return 'Tu nombre es obligatorio.';
    if (form.apellidoPaternoAdmin.trim().length < 2) return 'Tu apellido paterno es obligatorio.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.correoAdmin.trim())) return 'El correo no es valido.';
    if (form.password.length < 8) return 'La contrasena debe tener al menos 8 caracteres.';
    if (form.password !== form.password2) return 'Las contrasenas no coinciden.';
    return null;
  };

  const avanzar = () => {
    const problema = validarPaso(paso);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setPaso((previo) => (previo === 3 ? 3 : ((previo + 1) as 1 | 2 | 3)));
  };

  const enviar = async () => {
    for (const numero of [1, 2, 3] as const) {
      const problema = validarPaso(numero);
      if (problema) {
        setPaso(numero);
        setError(problema);
        return;
      }
    }

    setEnviando(true);
    setError(null);

    try {
      const captchaToken = turnstileRef.current?.getToken() ?? '';
      await registroApi.crear({
        nombreCondominio: form.nombreCondominio.trim(),
        direccionCondominio: form.direccionCondominio.trim() || undefined,
        numeroUnidades: Number(form.numeroUnidades),
        prefijoUnidad: form.prefijoUnidad,
        tipoUnidad: form.tipoUnidad,
        montoCuota: Number(form.montoCuota),
        recargoPorDia: Number(form.recargoPorDia || 0),
        diaLimitePago: Number(form.diaLimitePago),
        nombreAdmin: form.nombreAdmin.trim(),
        apellidoPaternoAdmin: form.apellidoPaternoAdmin.trim(),
        apellidoMaternoAdmin: form.apellidoMaternoAdmin.trim() || undefined,
        correoAdmin: form.correoAdmin.trim(),
        telefonoAdmin: form.telefonoAdmin.trim() || undefined,
        password: form.password,
        captchaToken,
      });
      setEnviado(true);
      turnstileRef.current?.reset();
    } catch (err) {
      setError(extraerMensaje(err));
      turnstileRef.current?.reset();
    } finally {
      setEnviando(false);
    }
  };

  if (sinConexion) {
    return (
      <PublicLayout
        title="No pudimos conectar con el servidor"
        subtitle="El registro no pudo verificar su disponibilidad."
      >
        <p className="muted-text">
          Esto no significa que el registro este cerrado: puede ser una caida temporal, tu conexion
          a internet o un mantenimiento. Vuelve a intentarlo en unos segundos.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="primary-btn"
            onClick={() => setReintento((previo) => previo + 1)}
          >
            Reintentar
          </button>
          <Link className="soft-btn" to="/login">
            Volver al inicio de sesion
          </Link>
        </div>
      </PublicLayout>
    );
  }

  if (disponible === false) {
    return (
      <PublicLayout title="Registro no disponible" subtitle="Esta instalacion no acepta altas publicas.">
        <p className="muted-text">
          El alta de condominios esta desactivada en este servidor. Contacta al administrador de la
          plataforma para que cree tu condominio.
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
      <PublicLayout
        title="Revisa tu correo"
        subtitle="Ya casi esta listo"
      >
        <p>
          Enviamos un enlace de confirmacion a <strong>{form.correoAdmin}</strong>.
        </p>
        <p className="muted-text">
          El enlace vence en 24 horas. Si no lo encuentras, revisa la carpeta de spam.
        </p>
        <div className="btn-row">
          <Link className="primary-btn" to="/login">
            Ir al inicio de sesion
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout
      title="Crea tu condominio"
      subtitle={
        suscripcionRequerida
          ? 'Registra tu condominio y activa la suscripcion para invitar a los condominos.'
          : 'Registra tu condominio y comparte el enlace con tus condominos.'
      }
      wide
      footer={
        <span>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesion</Link>
        </span>
      }
    >
      <div className="wizard-steps" role="list">
        {[
          { numero: 1, texto: 'Condominio' },
          { numero: 2, texto: 'Unidades y cuota' },
          { numero: 3, texto: 'Tu cuenta' },
        ].map((item) => (
          <div
            key={item.numero}
            role="listitem"
            className={`wizard-step${paso === item.numero ? ' activo' : ''}${
              paso > item.numero ? ' completado' : ''
            }`}
          >
            <span>{item.numero}</span>
            {item.texto}
          </div>
        ))}
      </div>

      {paso === 1 && (
        <div className="form-grid">
          <label className="field-label" htmlFor="nombreCondominio">
            Nombre del condominio
            <input
              id="nombreCondominio"
              value={form.nombreCondominio}
              onChange={(event) => actualizar('nombreCondominio', event.target.value)}
              placeholder="Residencial Las Palmas"
              maxLength={150}
            />
          </label>

          <label className="field-label" htmlFor="direccionCondominio">
            Direccion (opcional)
            <input
              id="direccionCondominio"
              value={form.direccionCondominio}
              onChange={(event) => actualizar('direccionCondominio', event.target.value)}
              placeholder="Calle, numero, colonia"
              maxLength={300}
            />
          </label>

          <label className="field-label" htmlFor="numeroUnidades">
            Numero de unidades
            <input
              id="numeroUnidades"
              type="number"
              min={1}
              max={2000}
              value={form.numeroUnidades}
              onChange={(event) => actualizar('numeroUnidades', event.target.value)}
            />
            <small className="muted-text">
              Cada unidad recibe su propia cuota y estado de cuenta.
            </small>
          </label>

          <label className="field-label" htmlFor="prefijoUnidad">
            Prefijo de las unidades
            <input
              id="prefijoUnidad"
              value={form.prefijoUnidad}
              onChange={(event) => actualizar('prefijoUnidad', event.target.value)}
              placeholder="Depto "
              maxLength={25}
            />
            <small className="muted-text">
              Se generaran: {unidadesPrevistas.join(', ')}
            </small>
          </label>

          <label className="field-label" htmlFor="tipoUnidad">
            Tipo de unidad
            <select
              id="tipoUnidad"
              value={form.tipoUnidad}
              onChange={(event) => actualizar('tipoUnidad', event.target.value)}
            >
              <option value="DEPARTAMENTO">Departamento</option>
              <option value="CASA">Casa</option>
              <option value="LOCAL">Local</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
        </div>
      )}

      {paso === 2 && (
        <div className="form-grid">
          <label className="field-label" htmlFor="montoCuota">
            Cuota mensual por unidad
            <input
              id="montoCuota"
              type="number"
              min={0}
              step="0.01"
              value={form.montoCuota}
              onChange={(event) => actualizar('montoCuota', event.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="diaLimitePago">
            Dia limite de pago
            <input
              id="diaLimitePago"
              type="number"
              min={1}
              max={28}
              value={form.diaLimitePago}
              onChange={(event) => actualizar('diaLimitePago', event.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="recargoPorDia">
            Recargo por dia de atraso
            <input
              id="recargoPorDia"
              type="number"
              min={0}
              step="0.01"
              value={form.recargoPorDia}
              onChange={(event) => actualizar('recargoPorDia', event.target.value)}
            />
          </label>

          <div className="public-note">
            <strong>Cuota inicial automatica</strong>
            <p className="muted-text">
              Al confirmar tu correo se generara la primera cuota de las{' '}
              {form.numeroUnidades} unidades por ${form.montoCuota} cada una.
            </p>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="form-grid">
          <label className="field-label" htmlFor="nombreAdmin">
            Tu nombre
            <input
              id="nombreAdmin"
              value={form.nombreAdmin}
              onChange={(event) => actualizar('nombreAdmin', event.target.value)}
              maxLength={100}
            />
          </label>

          <label className="field-label" htmlFor="apellidoPaternoAdmin">
            Apellido paterno
            <input
              id="apellidoPaternoAdmin"
              value={form.apellidoPaternoAdmin}
              onChange={(event) => actualizar('apellidoPaternoAdmin', event.target.value)}
              maxLength={80}
            />
          </label>

          <label className="field-label" htmlFor="apellidoMaternoAdmin">
            Apellido materno (opcional)
            <input
              id="apellidoMaternoAdmin"
              value={form.apellidoMaternoAdmin}
              onChange={(event) => actualizar('apellidoMaternoAdmin', event.target.value)}
              maxLength={80}
            />
          </label>

          <label className="field-label" htmlFor="correoAdmin">
            Correo electronico
            <input
              id="correoAdmin"
              type="email"
              value={form.correoAdmin}
              onChange={(event) => actualizar('correoAdmin', event.target.value)}
              maxLength={150}
            />
            <small className="muted-text">
              Usa tu correo personal. Con el iniciaras sesion como administrador.
            </small>
          </label>

          <label className="field-label" htmlFor="telefonoAdmin">
            Telefono (opcional)
            <input
              id="telefonoAdmin"
              value={form.telefonoAdmin}
              onChange={(event) => actualizar('telefonoAdmin', event.target.value)}
              maxLength={30}
            />
          </label>

          <label className="field-label" htmlFor="password">
            Contrasena
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => actualizar('password', event.target.value)}
              minLength={8}
            />
          </label>

          <label className="field-label" htmlFor="password2">
            Repite la contrasena
            <input
              id="password2"
              type="password"
              value={form.password2}
              onChange={(event) => actualizar('password2', event.target.value)}
              minLength={8}
            />
          </label>

          <div className="public-captcha">
            <TurnstileWidget ref={turnstileRef} action="registro_condominio" />
          </div>
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="btn-row">
        {paso > 1 && (
          <button
            type="button"
            className="soft-btn"
            onClick={() => {
              setError(null);
              setPaso((previo) => (previo === 1 ? 1 : ((previo - 1) as 1 | 2 | 3)));
            }}
            disabled={enviando}
          >
            Atras
          </button>
        )}

        {paso < 3 ? (
          <button type="button" className="primary-btn" onClick={avanzar}>
            Continuar
          </button>
        ) : (
          <button type="button" className="primary-btn" onClick={enviar} disabled={enviando}>
            {enviando ? 'Enviando...' : 'Crear condominio'}
          </button>
        )}
      </div>
    </PublicLayout>
  );
}

function extraerMensaje(error: unknown): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  // El helper devuelve "API 400: {json}"; se intenta extraer el mensaje legible.
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
  return mensaje || 'No fue posible completar el registro. Intenta de nuevo.';
}
