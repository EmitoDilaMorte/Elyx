import { useEffect, useState } from 'react';
import { backendApi } from '../services/backendApi.service';

type EstadoMfa = { habilitado: boolean; canal: 'TOTP' | 'EMAIL' | 'AMBOS' };

function mensajeDeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Error inesperado.');
  }
  return 'Error inesperado.';
}

/**
 * Alta y baja de MFA desde el perfil. Microsoft Authenticator (y cualquier
 * app TOTP) admite la cuenta con el secreto en base32 o el URI `otpauth://`.
 */
export function MfaSettings() {
  const [estado, setEstado] = useState<EstadoMfa | null>(null);
  const [alta, setAlta] = useState<{ secreto: string; otpauthUri: string; qrDataUrl: string | null } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [canal, setCanal] = useState<'TOTP' | 'EMAIL' | 'AMBOS'>('TOTP');
  const [recovery, setRecovery] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    backendApi
      .mfaEstado()
      .then((data) => setEstado(data))
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  const iniciarAlta = async () => {
    setLoading(true);
    setError(null);
    setMensaje(null);
    try {
      const data = await backendApi.iniciarMfa();
      setAlta(data);
      setCanal(estado?.canal ?? 'TOTP');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmarAlta = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await backendApi.activarMfa(codigo.trim(), canal);
      setRecovery(data.recoveryCodes);
      setEstado({ habilitado: true, canal });
      setAlta(null);
      setCodigo('');
      setMensaje('MFA activado. Guarda los codigos de recuperacion.');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  };

  const desactivar = async () => {
    setLoading(true);
    setError(null);
    setMensaje(null);
    try {
      await backendApi.desactivarMfa(codigo.trim());
      setEstado({ habilitado: false, canal: estado?.canal ?? 'TOTP' });
      setRecovery([]);
      setCodigo('');
      setMensaje('MFA desactivado.');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="panel animate-in stagger-2">
      <h4>Autenticacion en dos pasos (MFA)</h4>
      <p className="helper-text" style={{ marginBottom: '0.7rem' }}>
        {estado
          ? estado.habilitado
            ? `MFA activo (${estado.canal}).`
            : 'MFA desactivado. Protege tu cuenta con una aplicacion autenticadora o codigo por correo.'
          : 'Consultando estado de MFA...'}
      </p>

      {!estado?.habilitado && !alta && (
        <button className="primary-btn" type="button" onClick={iniciarAlta} disabled={loading}>
          {loading ? 'Generando...' : 'Activar MFA'}
        </button>
      )}

      {alta && (
        <div>
          <p className="helper-text">
            Abre Microsoft Authenticator (o cualquier app TOTP), elige{' '}
            <strong>Agregar cuenta &rarr; Otra cuenta</strong> y escanea este codigo QR.
          </p>

          {alta.qrDataUrl ? (
            <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
              <img
                src={alta.qrDataUrl}
                alt="Codigo QR para configurar la autenticacion en dos pasos"
                width={220}
                height={220}
                style={{ borderRadius: '8px', background: '#fff', padding: '8px', maxWidth: '100%' }}
              />
            </div>
          ) : (
            <p className="login-error">No se pudo generar el QR. Usa el secreto manual.</p>
          )}

          <details style={{ marginBottom: '0.75rem' }}>
            <summary className="helper-text" style={{ cursor: 'pointer' }}>
              No puedo escanear el QR (capturar el secreto manualmente)
            </summary>
            <label className="field-label" htmlFor="mfa-secreto">Secreto (base32)</label>
            <input id="mfa-secreto" readOnly value={alta.secreto} onFocus={(event) => event.currentTarget.select()} />
            <label className="field-label" htmlFor="mfa-otpauth">URI otpauth</label>
            <textarea id="mfa-otpauth" readOnly rows={2} value={alta.otpauthUri} onFocus={(event) => event.currentTarget.select()} />
          </details>

          <label className="field-label" htmlFor="mfa-canal">Canal alternativo</label>
          <select
            id="mfa-canal"
            className="condominio-switcher-select"
            value={canal}
            onChange={(event) => setCanal(event.target.value as 'TOTP' | 'EMAIL' | 'AMBOS')}
          >
            <option value="TOTP">Solo aplicacion autenticadora</option>
            <option value="AMBOS">Aplicacion y correo</option>
            <option value="EMAIL">Solo codigo por correo</option>
          </select>

          <label className="field-label" htmlFor="mfa-setup-codigo">Codigo de verificacion</label>
          <input
            id="mfa-setup-codigo"
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          />
          <div className="btn-row" style={{ marginTop: '0.8rem' }}>
            <button className="primary-btn" type="button" onClick={confirmarAlta} disabled={loading || codigo.length !== 6}>
              Confirmar y activar
            </button>
            <button className="soft-btn" type="button" onClick={() => { setAlta(null); setCodigo(''); }} disabled={loading}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {estado?.habilitado && (
        <div style={{ marginTop: '0.8rem' }}>
          <label className="field-label" htmlFor="mfa-disable-codigo">Codigo para desactivar</label>
          <input
            id="mfa-disable-codigo"
            type="text"
            inputMode="numeric"
            placeholder="000000 o codigo de recuperacion"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value.replace(/[^\w-]/g, '').slice(0, 14))}
          />
          <div className="btn-row" style={{ marginTop: '0.8rem' }}>
            <button className="soft-btn" type="button" onClick={desactivar} disabled={loading || codigo.length < 6}>
              Desactivar MFA
            </button>
          </div>
        </div>
      )}

      {recovery.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <p className="helper-text">Codigos de recuperacion (se muestran una sola vez):</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{recovery.join('\n')}</pre>
        </div>
      )}

      {error && <p className="login-error">{error}</p>}
      {mensaje && <p className="helper-text" style={{ color: 'var(--green)' }}>{mensaje}</p>}
    </article>
  );
}
