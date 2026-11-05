import { useEffect, useState } from 'react';
import { suscripcionesApi, type DatosFiscales } from '../services/suscripciones.service';

type DatosFiscalesFormProps = {
  idCondominio: number;
  /** Se invoca tras guardar, para que el panel recargue el estado. */
  onGuardado?: (datos: DatosFiscales) => void;
  /** Oculta el formulario tras guardarlo (usado antes del checkout). */
  onCompletado?: (datos: DatosFiscales) => void;
};

/**
 * Regimenes del SAT. Se guarda solo la clave (`cve_regimen`): es lo que pide el
 * CFDI. Guardar la descripcion obligaria a re-parsearla al emitir facturas.
 */
const REGIMENES = [
  { clave: '601', etiqueta: 'General de Ley Personas Morales' },
  { clave: '603', etiqueta: 'Personas Morales con Fines no Lucrativos' },
  { clave: '605', etiqueta: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { clave: '606', etiqueta: 'Arrendamiento' },
  { clave: '608', etiqueta: 'Demás ingresos' },
  { clave: '612', etiqueta: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { clave: '616', etiqueta: 'Sin obligaciones fiscales' },
  { clave: '620', etiqueta: 'Sociedades Cooperativas de Producción' },
  { clave: '621', etiqueta: 'Incorporación Fiscal' },
  { clave: '626', etiqueta: 'Régimen Simplificado de Confianza (RESICO)' },
];

/**
 * Normaliza lo que venga del backend a una clave valida. Las filas guardadas
 * con el texto completo ("603 - Personas Morales...") se reducen a su clave
 * para que el `select` las vuelva a reconocer.
 */
function normalizarRegimen(valor: string | null | undefined): string {
  const texto = (valor ?? '').trim();
  if (!texto) {
    return '';
  }
  const clave = texto.slice(0, 3);
  return REGIMENES.some((regimen) => regimen.clave === clave) ? clave : '';
}


type FormState = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  cpFiscal: string;
  correoFacturacion: string;
};

const ESTADO_INICIAL: FormState = {
  rfc: '',
  razonSocial: '',
  regimenFiscal: '',
  cpFiscal: '',
  correoFacturacion: '',
};

/**
 * Captura de datos fiscales para el CFDI.
 *
 * La emision de facturas aun no esta implementada, pero se piden desde ahora:
 * migrar estos datos despues, con clientes activos, es mucho mas caro que
 * capturarlos antes del primer pago.
 */
export function DatosFiscalesForm({
  idCondominio,
  onGuardado,
  onCompletado,
}: DatosFiscalesFormProps) {
  const [form, setForm] = useState<FormState>(ESTADO_INICIAL);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [yaCompleto, setYaCompleto] = useState(false);

  useEffect(() => {
    let cancelado = false;

    void suscripcionesApi
      .datosFiscales(idCondominio)
      .then((datos) => {
        if (cancelado) {
          return;
        }
        setForm({
          rfc: datos.rfc ?? '',
          razonSocial: datos.razonSocial ?? '',
          regimenFiscal: normalizarRegimen(datos.regimenFiscal),
          cpFiscal: datos.cpFiscal ?? '',
          correoFacturacion: datos.correoFacturacion ?? '',
        });
        setYaCompleto(datos.completo);
      })
      .catch(() => {
        /* sin datos previos: el formulario arranca vacio */
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [idCondominio]);

  const actualizar = (campo: keyof FormState, valor: string) => {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  };

  const guardar = async () => {
    setError(null);
    setAviso(null);

    const rfc = form.rfc.trim().toUpperCase();
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
      setError('El RFC no tiene un formato valido (12 o 13 caracteres).');
      return;
    }
    if (form.cpFiscal.trim() && !/^\d{5}$/.test(form.cpFiscal.trim())) {
      setError('El codigo postal debe tener 5 digitos.');
      return;
    }

    setGuardando(true);
    try {
      const datos = await suscripcionesApi.actualizarDatosFiscales(idCondominio, {
        rfc: rfc || undefined,
        razonSocial: form.razonSocial.trim() || undefined,
        regimenFiscal: form.regimenFiscal.trim() || undefined,
        cpFiscal: form.cpFiscal.trim() || undefined,
        correoFacturacion: form.correoFacturacion.trim() || undefined,
      });

      setYaCompleto(datos.completo);
      setAviso(
        datos.completo
          ? 'Datos fiscales guardados. Podras solicitar tu factura cuando se habilite la emision.'
          : 'Datos guardados parcialmente. Completa RFC, razon social, regimen y CP para facturar.',
      );
      onGuardado?.(datos);
      onCompletado?.(datos);
    } catch (err) {
      setError(extraerMensaje(err, 'No fue posible guardar los datos fiscales.'));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return <p className="muted-text">Cargando datos fiscales...</p>;
  }

  return (
    <section className="datos-fiscales">
      <div className="super-block-header">
        <div>
          <h4>Datos de facturacion</h4>
          <p className="helper-text" style={{ marginTop: '0.25rem' }}>
            Se usaran para emitir tu CFDI. Todavia no se generan facturas automaticamente, pero
            conviene capturarlos ahora.
          </p>
        </div>
        {yaCompleto && <span className="status-pill status-pagada">Completos</span>}
      </div>

      <div className="form-grid">
        <label className="field-label" htmlFor="fiscal-rfc">
          RFC
          <input
            id="fiscal-rfc"
            value={form.rfc}
            onChange={(e) => actualizar('rfc', e.target.value.toUpperCase())}
            placeholder="XAXX010101000"
            maxLength={13}
          />
          <small className="muted-text">12 caracteres (moral) o 13 (fisica).</small>
        </label>

        <label className="field-label" htmlFor="fiscal-razon">
          Razon social
          <input
            id="fiscal-razon"
            value={form.razonSocial}
            onChange={(e) => actualizar('razonSocial', e.target.value)}
            placeholder="Condominio Residencial Las Palmas A.C."
            maxLength={200}
          />
        </label>

        <label className="field-label" htmlFor="fiscal-regimen">
          Regimen fiscal
          <select
            id="fiscal-regimen"
            value={form.regimenFiscal}
            onChange={(e) => actualizar('regimenFiscal', e.target.value)}
          >
            <option value="">Selecciona un regimen</option>
            {REGIMENES.map((regimen) => (
              <option key={regimen.clave} value={regimen.clave}>
                {regimen.clave} - {regimen.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label" htmlFor="fiscal-cp">
          Codigo postal fiscal
          <input
            id="fiscal-cp"
            value={form.cpFiscal}
            onChange={(e) => actualizar('cpFiscal', e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="11000"
            inputMode="numeric"
          />
        </label>

        <label className="field-label" htmlFor="fiscal-correo">
          Correo para facturas (opcional)
          <input
            id="fiscal-correo"
            type="email"
            value={form.correoFacturacion}
            onChange={(e) => actualizar('correoFacturacion', e.target.value)}
            placeholder="facturas@tucondominio.mx"
            maxLength={150}
          />
        </label>
      </div>

      {error && <div className="login-error">{error}</div>}
      {aviso && <div className="reminder-box">{aviso}</div>}

      <div className="btn-row">
        <button type="button" className="primary-btn" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar datos fiscales'}
        </button>
      </div>
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
