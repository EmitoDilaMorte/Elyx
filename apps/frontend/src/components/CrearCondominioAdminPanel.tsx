import { useState } from 'react';
import { claseEstadoCondominio, etiquetaEstadoCondominio } from '../constants/status';
import { registroApi, type ResultadoVerificacion } from '../services/registro.service';

type FormState = {
  nombreCondominio: string;
  direccionCondominio: string;
  numeroUnidades: string;
  prefijoUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
  montoCuota: string;
  recargoPorDia: string;
  diaLimitePago: string;
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
};

type CrearCondominioAdminPanelProps = {
  /** Se invoca tras crear el condominio para refrescar la lista del sidebar. */
  onCreado?: (resultado: ResultadoVerificacion) => void;
};

/**
 * Alta de condominios desde la sesion del administrador.
 *
 * A diferencia del formulario publico no pide correo ni contrasena ni envia
 * verificacion: la sesion ya prueba la identidad. Es la via correcta cuando el
 * administrador ya tiene cuenta en Elyx.
 */
export function CrearCondominioAdminPanel({ onCreado }: CrearCondominioAdminPanelProps) {
  const [form, setForm] = useState<FormState>(ESTADO_INICIAL);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoVerificacion | null>(null);

  const actualizar = (campo: keyof FormState, valor: string) => {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  };

  const enviar = async () => {
    if (form.nombreCondominio.trim().length < 3) {
      setError('El nombre del condominio es obligatorio.');
      return;
    }
    const total = Number(form.numeroUnidades);
    if (!Number.isInteger(total) || total < 1 || total > 2000) {
      setError('Indica entre 1 y 2000 unidades.');
      return;
    }

    setTrabajando(true);
    setError(null);

    try {
      const creado = await registroApi.crearComoAdmin({
        nombreCondominio: form.nombreCondominio.trim(),
        direccionCondominio: form.direccionCondominio.trim() || undefined,
        numeroUnidades: total,
        prefijoUnidad: form.prefijoUnidad,
        tipoUnidad: form.tipoUnidad,
        montoCuota: Number(form.montoCuota),
        recargoPorDia: Number(form.recargoPorDia || 0),
        diaLimitePago: Number(form.diaLimitePago),
      });
      setResultado(creado);
      setForm(ESTADO_INICIAL);
      onCreado?.(creado);
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible crear el condominio.'));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="grid-cards">
      <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
        <h4>Crear un condominio nuevo</h4>
        <p className="muted-text">
          Tu cuenta queda como administrador del nuevo condominio. No hace falta verificar correo ni
          volver a escribir tu contrasena.
        </p>

        {resultado && (
          <div className="reminder-box">
            <strong className="reminder-title">
              {resultado.nombreCondominio} creado
            </strong>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {resultado.unidadesCreadas} unidades y {resultado.cuotasCreadas} cuotas generadas.
            </p>
            <p style={{ margin: '0.5rem 0 0' }}>
              <span className={`status-pill ${claseEstadoCondominio(resultado.estadoCondominio)}`}>
                {etiquetaEstadoCondominio(resultado.estadoCondominio)}
              </span>
            </p>
            <p className="muted-text" style={{ margin: '0.35rem 0 0' }}>
              {resultado.requierePago
                ? 'Falta confirmar el pago de la suscripcion para poder invitar condominos.'
                : 'Ya puedes generar el enlace de invitacion en la seccion Invitaciones.'}
            </p>
          </div>
        )}

        <div className="form-grid">
          <label className="field-label" htmlFor="admin-condo-nombre">
            Nombre del condominio
            <input
              id="admin-condo-nombre"
              value={form.nombreCondominio}
              onChange={(e) => actualizar('nombreCondominio', e.target.value)}
              placeholder="Residencial Las Palmas"
              maxLength={150}
            />
          </label>

          <label className="field-label" htmlFor="admin-condo-direccion">
            Direccion (opcional)
            <input
              id="admin-condo-direccion"
              value={form.direccionCondominio}
              onChange={(e) => actualizar('direccionCondominio', e.target.value)}
              maxLength={300}
            />
          </label>

          <label className="field-label" htmlFor="admin-condo-unidades">
            Numero de unidades
            <input
              id="admin-condo-unidades"
              type="number"
              min={1}
              max={2000}
              value={form.numeroUnidades}
              onChange={(e) => actualizar('numeroUnidades', e.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="admin-condo-prefijo">
            Prefijo de las unidades
            <input
              id="admin-condo-prefijo"
              value={form.prefijoUnidad}
              onChange={(e) => actualizar('prefijoUnidad', e.target.value)}
              placeholder="Depto "
              maxLength={25}
            />
          </label>

          <label className="field-label" htmlFor="admin-condo-tipo">
            Tipo de unidad
            <select
              id="admin-condo-tipo"
              value={form.tipoUnidad}
              onChange={(e) => actualizar('tipoUnidad', e.target.value)}
            >
              <option value="DEPARTAMENTO">Departamento</option>
              <option value="CASA">Casa</option>
              <option value="LOCAL">Local</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>

          <label className="field-label" htmlFor="admin-condo-monto">
            Cuota mensual por unidad
            <input
              id="admin-condo-monto"
              type="number"
              min={0}
              step="0.01"
              value={form.montoCuota}
              onChange={(e) => actualizar('montoCuota', e.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="admin-condo-dia">
            Dia limite de pago
            <input
              id="admin-condo-dia"
              type="number"
              min={1}
              max={28}
              value={form.diaLimitePago}
              onChange={(e) => actualizar('diaLimitePago', e.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="admin-condo-recargo">
            Recargo por dia de atraso
            <input
              id="admin-condo-recargo"
              type="number"
              min={0}
              step="0.01"
              value={form.recargoPorDia}
              onChange={(e) => actualizar('recargoPorDia', e.target.value)}
            />
          </label>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="btn-row">
          <button type="button" className="primary-btn" onClick={() => void enviar()} disabled={trabajando}>
            {trabajando ? 'Creando...' : 'Crear condominio'}
          </button>
        </div>
      </article>
    </section>
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
