import { Link } from 'react-router-dom';
import { PublicLayout } from './PublicLayout';

/**
 * Politica de pagos, reembolsos y aclaraciones.
 *
 * **Existe por un requisito de Stripe.** Su
 * [FAQ de activacion](https://support.stripe.com/questions/business-website-for-account-activation-faq)
 * pide que la web del negocio incluya la politica de reembolsos y disputas junto
 * con los datos de contacto. En lugar de pedirle al administrador que redacte una
 * por condominio, Elyx publica esta y la enlaza desde cada pagina publica.
 *
 * El texto describe el modelo real del producto: el dinero llega a la cuenta del
 * condominio y Elyx no intermedia, asi que los reembolsos los decide el
 * condominio (es su dinero) y Elyx solo acompana el tramite.
 */
export function PoliticaPagosPage() {
  return (
    <PublicLayout
      title="Política de pagos, reembolsos y aclaraciones"
      subtitle="Aplica a los pagos de cuotas de mantenimiento hechos dentro de Elyx"
      wide
    >
      <section className="condo-bloque">
        <h3>Quién recibe el dinero</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Los pagos de cuotas se abonan directamente a la cuenta del condominio. Elyx es la
          plataforma que registra y muestra los movimientos, pero <strong>no recibe, no retiene y
          no intermedia</strong> el dinero de las cuotas.
        </p>
      </section>

      <section className="condo-bloque">
        <h3>Pagos con tarjeta</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          El cobro con tarjeta lo procesa Stripe en nombre del condominio. La comisión de la
          procesadora la absorbe el condominio; el condómino paga exactamente el monto de su cuota.
          Elyx nunca ve ni almacena los datos de la tarjeta.
        </p>
      </section>

      <section className="condo-bloque">
        <h3>Transferencias</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          En las transferencias, el condómino usa la CLABE y la referencia que muestra Elyx. La
          cuota se marca como pagada cuando el administrador confirma que el depósito llegó a la
          cuenta del condominio.
        </p>
      </section>

      <section className="condo-bloque">
        <h3>Reembolsos y aclaraciones</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Los reembolsos los autoriza el condominio, porque el dinero entró a su cuenta. Si
          consideras que un cargo es incorrecto:
        </p>
        <ol className="muted-text">
          <li>
            Contacta primero al administrador del condominio por los medios que aparecen en la
            página pública del condominio.
          </li>
          <li>
            Si el cargo fue con tarjeta y no se resuelve, puedes solicitar una aclaración a tu banco
            emisor dentro de los plazos que marca tu contrato.
          </li>
          <li>
            Si el problema es de funcionamiento de la plataforma, escríbenos desde la página de
            contacto de Elyx.
          </li>
        </ol>
      </section>

      <section className="condo-bloque">
        <h3>Contracargos</h3>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Cuando un banco abre un contracargo, el monto se descuenta de la cuenta del condominio y
          el condominio es quien responde aportando la evidencia. Elyx no absorbe contracargos ni
          cobra comisión por transacción.
        </p>
      </section>

      <div className="condo-footer">
        <Link to="/login" className="link-btn">
          Volver a Elyx
        </Link>
      </div>
    </PublicLayout>
  );
}
