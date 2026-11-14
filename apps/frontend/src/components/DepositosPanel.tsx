import { useCallback, useEffect, useState } from 'react';
import { extraerMensaje } from '../lib/errores';
import { cobrosApi, type Deposito, type EstadoDeposito } from '../services/cobros.service';

type DepositosPanelProps = {
  idCondominio: number;
};

const MONEDA = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

/**
 * Etiqueta y color de cada estado de Stripe.
 *
 * Se reutilizan las clases de chip que ya existen en `styles.css`; no se
 * inventan colores nuevos para que los estados se lean igual en toda la app.
 */
const ESTADO: Record<EstadoDeposito, { texto: string; clase: string }> = {
  pending: { texto: 'Programado', clase: 'status-pendiente' },
  in_transit: { texto: 'En camino', clase: 'status-en_validacion' },
  paid: { texto: 'Depositado', clase: 'status-pagada' },
  failed: { texto: 'Falló', clase: 'status-vencida' },
  canceled: { texto: 'Cancelado', clase: 'status-cancelada' },
};

/** Fecha larga sin hora: `llegaEn` es una fecha, no un instante. */
function fechaLarga(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const fecha = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Depósitos que Stripe hizo (o hará) a la cuenta del condominio.
 *
 * **Por qué está aquí y no en Stripe**: la cuenta conectada se creó con
 * `dashboard: 'none'`, así que el administrador no tiene ningún panel de Stripe
 * donde ver esta información. Sin este bloque, tendría que revisar su estado de
 * cuenta bancario y adivinar qué movimientos son cuotas cobradas con tarjeta.
 *
 * Se alimenta de dos fuentes, ambas en el backend:
 *  - el webhook de Connect (`payout.*`), que llega en segundos;
 *  - una reconciliación diaria contra `payouts.list`, para lo que se pierda.
 *
 * El botón "Actualizar" fuerza esa reconciliación: es lo que usa el
 * administrador cuando ya vio el depósito en su banco.
 */
export function DepositosPanel({ idCondominio }: DepositosPanelProps) {
  const [depositos, setDepositos] = useState<Deposito[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [reconciliando, setReconciliando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDepositos(await cobrosApi.depositos(idCondominio));
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudieron cargar los depósitos.'));
    } finally {
      setCargando(false);
    }
  }, [idCondominio]);

  useEffect(() => {
    setCargando(true);
    setDepositos(null);
    void cargar();
  }, [cargar]);

  /**
   * Fuerza la reconciliación contra Stripe.
   *
   * No crea depósitos: solo copia los que ya existen en la cuenta conectada.
   * Por eso se puede pulsar sin riesgo de duplicar nada.
   */
  const reconciliar = async () => {
    setReconciliando(true);
    setError(null);
    setAviso(null);
    try {
      const resultado = await cobrosApi.reconciliarDepositos(idCondominio);
      if (resultado.error === 'sin-cuenta-connect') {
        setAviso('El condominio todavía no conectó su cuenta de Stripe.');
      } else if (resultado.error) {
        setError(`No se pudo consultar Stripe: ${resultado.error}`);
      } else if (resultado.creados === 0 && resultado.actualizados === 0) {
        setAviso(
          resultado.revisados === 0
            ? 'Stripe no reporta depósitos todavía.'
            : 'Todo estaba al día: no hubo cambios.',
        );
      } else {
        setAviso(
          `Depósitos actualizados: ${resultado.creados} nuevos, ${resultado.actualizados} modificados.`,
        );
      }
      await cargar();
    } catch (err) {
      setError(extraerMensaje(err, 'No se pudo reconciliar los depósitos.'));
    } finally {
      setReconciliando(false);
    }
  };

  const totalDepositado = (depositos ?? [])
    .filter((item) => item.estado === 'paid')
    .reduce((acc, item) => acc + item.monto, 0);

  const enCamino = (depositos ?? [])
    .filter((item) => item.estado === 'pending' || item.estado === 'in_transit')
    .reduce((acc, item) => acc + item.monto, 0);

  return (
    <article className="panel animate-in" style={{ gridColumn: '1 / -1' }}>
      <div className="panel-header-row">
        <div>
          <h4>Depósitos de Stripe</h4>
          <p className="helper-text" style={{ margin: '0.25rem 0 0' }}>
            Lo que Stripe ya transfirió a tu cuenta bancaria por los pagos con tarjeta. La
            comisión ya viene descontada.
          </p>
        </div>
        <button
          type="button"
          className="soft-btn"
          onClick={() => void reconciliar()}
          disabled={reconciliando || cargando}
        >
          {reconciliando ? 'Consultando Stripe...' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}
      {aviso && <p className="helper-text">{aviso}</p>}

      {cargando && <p className="muted-text">Cargando depósitos...</p>}

      {!cargando && depositos && depositos.length === 0 && (
        <p className="empty-state">
          Todavía no hay depósitos. Stripe los programa unos días después de cada cobro con
          tarjeta, cuando el dinero ya está disponible.
        </p>
      )}

      {!cargando && depositos && depositos.length > 0 && (
        <>
          <div className="depositos-resumen">
            <div>
              <small className="muted-text">Depositado</small>
              <p className="big-number" style={{ margin: 0 }}>
                {MONEDA.format(totalDepositado)}
              </p>
            </div>
            <div>
              <small className="muted-text">En camino</small>
              <p className="big-number" style={{ margin: 0 }}>
                {MONEDA.format(enCamino)}
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Llega</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {depositos.map((deposito) => {
                  const estado = ESTADO[deposito.estado] ?? {
                    texto: deposito.estado,
                    clase: 'status-pendiente',
                  };
                  return (
                    <tr key={deposito.idDeposito}>
                      <td>{fechaLarga(deposito.llegaEn)}</td>
                      <td>{MONEDA.format(deposito.monto)}</td>
                      <td>
                        <span className={`status-pill ${estado.clase}`}>{estado.texto}</span>
                      </td>
                      <td>{deposito.tipo === 'card' ? 'Tarjeta' : 'Cuenta bancaria'}</td>
                      <td>
                        <span className="mono" style={{ fontSize: '0.8rem' }}>
                          {deposito.stripePayoutId}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="muted-text" style={{ marginTop: '0.6rem', fontSize: '0.85rem' }}>
            «Programado» y «En camino» son depósitos que Stripe ya generó y todavía no llegan al
            banco. Si un depósito aparece como «Falló», revisa que tu cuenta bancaria siga activa:
            Stripe la deshabilita cuando rechaza una transferencia.
          </p>
        </>
      )}
    </article>
  );
}
