# Decisión: migrar el cobro con tarjeta a `dashboard: 'none'` + componentes embebidos

**Estado**: implementada y verificada. Fases 0 a 6 completas
**Fecha de la investigación**: 2026-11-11
**Ámbito**: `apps/backend/src/modules/cobros/connect.service.ts` y el onboarding de Stripe Connect
**Decide**: cambiar `dashboard: 'full'` por `dashboard: 'none'` y sustituir el onboarding
hospedado por los componentes embebidos de Stripe

---

## 1. Resumen ejecutivo

El cobro de cuotas con tarjeta funciona sobre Stripe Connect v2 con **direct charges**: el cargo
se crea sobre la cuenta conectada del condominio, el dinero nunca pasa por el balance de Elyx, y
la configuración actual deja a **Stripe** como responsable de las comisiones, del KYC y de los
saldos negativos.

El problema no es el modelo de dinero ni la seguridad: es **la experiencia de alta**. Las cuentas
se crean con `dashboard: 'full'`, lo que obliga al administrador del condominio a:

1. Salir de Elyx y completar un registro largo en Stripe.
2. Inventar una página web que en la mayoría de los casos no existe.
3. Atravesar tres pantallas de productos que no pidió (Radar, Stripe Tax, Stripe Climate).
4. Terminar con acceso al **dashboard completo de Stripe**, que duplica la funcionalidad de Elyx
   y le permite desconfigurar el cobro (por ejemplo, reactivar MSI y encarecer sus propias cuotas).

La decisión es migrar a `dashboard: 'none'` con **onboarding y gestión embebidos dentro de Elyx**.
Se verificó contra la cuenta de test real que esa combinación mantiene a **Stripe** como
responsable del KYC y de las pérdidas por saldo negativo, y que el condominio nunca sale de Elyx.

**Lo que NO cambia**: el modelo de dinero. Sigue siendo direct charge, la comisión la absorbe el
condominio, Elyx cobra 0% por transacción y la cuota nunca se incrementa.

---

## 2. Contexto: cómo llegamos aquí

### 2.1 El sistema de pagos ya implementado

Antes de esta decisión, el cobro interno de cuotas quedó completo y verificado:

| Pieza | Dónde vive | Estado |
|---|---|---|
| Configuración de cobro (SPEI / tarjeta) | `modules/cobros/cobros.service.ts` | ✅ |
| Cargos SPEI con referencia legible | `cobros.service.ts` | ✅ |
| Conciliación SPEI por el administrador | `validaciones` en el frontend | ✅ |
| Stripe Connect v2 (cuentas + onboarding) | `cobros/connect.service.ts` | ✅ |
| Cargos con tarjeta (direct charge) | `cobros/cobros-stripe.service.ts` | ✅ |
| Webhook de Connect | `cobros/stripe-connect-webhook.controller.ts` | ✅ |
| Estado de cuenta calculado en servidor | `cuotas/estado-cuenta.controller.ts` | ✅ |
| Comisiones en el reporte financiero | `reportes-financieros.service.ts` | ✅ |

### 2.2 Decisiones de dinero ya tomadas (siguen vigentes)

Estas se conservan íntegras y **no forman parte** de lo que se va a cambiar:

- **Direct charges.** El cargo se crea con `{ stripeAccount: 'acct_...' }`. El dinero nunca entra
  al balance de Elyx.
- **Elyx cobra 0% de comisión.** No se envía `application_fee_amount`.
- **El condominio absorbe la comisión de Stripe.** El condómino paga exactamente el monto de su
  cuota.
- **MSI apagado por defecto.** `permitir_msi` es `false`: cada plazo agrega 5% o más de comisión
  que absorbe el condominio.
- **Comisión real, no calculada.** Se lee del `balance transaction` después del cargo.
- **RFC obligatorio para activar tarjeta.** Sin RFC no se puede verificar la cuenta; SPEI sigue
  disponible.
- **La comisión no entra a la tabla `gastos`**: se deriva de `cargos_cuota` para evitar doble
  conteo.

### 2.3 Tarifas de Stripe México vigentes al momento de la decisión

| Concepto | Costo |
|---|---|
| Tarjeta nacional | 3.6% + MXN 3.00 + IVA sobre la comisión |
| Tarjeta internacional | +0.5% |
| Conversión de moneda | +2% |
| MSI (3 meses) | desde 5% |
| Disputa recibida | MXN 150.00 |
| Radar Pro (modo live) | MXN 1.60 por transacción evaluada |

**Ejemplo con una cuota de $1,000 (tarjeta nacional):** 36.00 (3.6%) + 3.00 (fija) = 39.00;
IVA 16% = 6.24; **total 45.24**; neto al condominio **954.76**.

---

## 3. El problema reportado

Durante la prueba real del flujo, el administrador (Luis Torres, condominio 2) intentó crear su
cuenta de Stripe y se encontró con cuatro fricciones.

### 3.1 Página web obligatoria

> *"Me pide una página web o red social de la empresa, pero si el condominio no tiene página web
> o red social (mayoría de los casos)? No me deja terminar de crear la cuenta hasta rellenar la
> página web."*

Stripe exige `business_url` y no acepta un valor arbitrario porque lo puede verificar.

### 3.2 Tres pantallas de productos no solicitados

> *"Las últimas 3 secciones fueron más bien como publicidad de Stripe intentando venderme algo"*

| Sección mostrada | Paso interno de Stripe | Costo en modo live |
|---|---|---|
| Plan de protección contra fraudes (Radar Pro) | `fraud_protection` | MXN 1.60 por transacción evaluada |
| Monitorización y cálculo de Stripe Tax | `tax` | Porcentaje sobre transacciones |
| Compromiso con Climate | `climate` | Fracción de ingresos |

**Aclaración importante del usuario**: en modo test la pantalla decía
*"Tu cuenta incluye Radar Pro en el entorno de prueba... Las tarifas de Radar no se aplicarán en
el entorno de prueba. Puedes actualizar tu plan antes de pasar a modo activo."*
Es decir, **en test no se cobra**, pero en live sí: es un costo real que el condominio absorbería
sin haberlo pedido ni saberlo.

### 3.3 Dashboard completo innecesario

> *"Al tener acceso al dashboard completo pueden configurar lo que quieran ahí, que siento que
> honestamente es innecesario porque agrega una herramienta completa al flujo y básicamente
> eliminaría el propósito de usar Elyx para manejar los pagos."*

Este punto es el más importante de los cuatro. Con `dashboard: 'full'`, el condominio obtiene
una herramienta de pagos completa que compite con Elyx, y además puede:

- Reactivar MSI y encarecer sus propias cuotas (riesgo ya identificado en el plan original:
  *"Con `dashboard: 'full'` el condominio puede reactivar MSI en su panel aunque el default sea
  off"*).
- Cambiar métodos de pago y mostrar OXXO, activando el caso de pago asíncrono.
- Ver y gestionar reembolsos y disputas por fuera de Elyx.
- Irse a Stripe directamente y dejar de usar el módulo de cobros.

### 3.4 Proceso largo y fuera de Elyx

> *"El proceso de registro es un tanto largo y te lleva fuera de Elyx."*

Con el onboarding hospedado el administrador abandona la aplicación, y al volver no hay ninguna
pantalla de destino: las rutas `/connect/return` y `/connect/refresh` que el backend usa como
`return_url` y `refresh_url` **no existen en el frontend** (verificado con búsqueda: cero
coincidencias en `apps/frontend/src`). El administrador termina en `/inicio` sin saber si quedó
listo o qué le falta.

---

## 4. Investigación: qué opciones existen

### 4.1 Los tres valores de `dashboard` en Accounts v2

La API oficial documenta exactamente tres valores para el parámetro `dashboard`:

| Valor | Qué obtiene el condominio |
|---|---|
| `full` | Dashboard completo de Stripe (lo que hay hoy) |
| `express` | Dashboard Express, limitado a pagos y depósitos |
| `none` | **Ningún** dashboard alojado por Stripe |

### 4.2 El obstáculo con `express`

La primera intuición fue "bajemos a `express`, que es solo seguimiento de depósitos". Pero la API
lo prohíbe con una restricción explícita en la lista de códigos de error:

```
account_controller_express_dash_without_application_losses_or_fees
"If `dashboard` is `express`, `fees_collector` must be `application` and
 `losses_collector` must be `application`."
```

**Es decir: `express` obliga a que Elyx sea responsable de las comisiones y de los saldos
negativos (contracargos).** Es exactamente lo que la configuración actual evita y lo que no
queremos asumir.

Existe una excepción en *public preview* (`2026-10-28.preview`) que permitiría Express con Stripe
como responsable de pérdidas, pero se descartó: usar una API en preview para manejar dinero real
no es aceptable.

### 4.3 Por qué `none` sí sirve

La documentación de componentes embebidos describe este escenario como soportado:

> *"For an account without Stripe-hosted Dashboard access where Stripe is liable for negative
> balances, use Connect embedded components to provide self-serve account updates. You can't
> create Account Links of type `account_update` for such accounts."*

Y añade el requisito implícito:

> *"**Required embedded components**: When Stripe is responsible for negative balances on your
> connected accounts, you must integrate embedded components for onboarding, account management,
> and the notification banner."*

Traducción: con `dashboard: 'none'` y Stripe como responsable de pérdidas, **Elyx está obligado**
a montar tres componentes para que el condominio pueda gestionarse.

---

## 5. Verificación empírica

No se tomó la decisión con la documentación sola. Se ejecutaron pruebas contra la cuenta de test
real del proyecto con `stripe@23.1.0` (apiVersion `2026-10-28.endive`).

### 5.1 Creación de la cuenta con `dashboard: 'none'`

```js
await stripe.v2.core.accounts.create({
  display_name: 'Verificacion dashboard none',
  identity: { country: 'mx', entity_type: 'company', business_details: { ... } },
  configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
  defaults: {
    currency: 'mxn',
    locales: ['es-419'],
    profile: { product_description: 'Cobro de cuotas de mantenimiento del condominio' },
    responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
  },
  dashboard: 'none',
  include: ['configuration.merchant', 'identity', 'defaults', 'requirements'],
});
```

**Resultado:**

```
OK  cuenta creada: acct_1UanPUDMdbCBkHgR

dashboard            : none
responsibilities     : {"fees_collector":"stripe","losses_collector":"stripe",
                        "requirements_collector":"stripe"}
card_payments.status : {"status":"restricted",
                        "status_details":[{"code":"requirements_past_due",
                                          "resolution":"provide_info"}]}
```

**Stripe declara las tres responsabilidades como suyas.** `card_payments` está en `restricted`
porque falta el KYC, que es lo esperado en una cuenta recién creada.

### 5.2 `requirements_collector` no se puede configurar: se deriva

Al intentar pasarlo explícitamente, la API lo rechaza:

```
invalid_fields: "Some fields in the request were invalid:
 'defaults.responsibilities.requirements_collector: Unknown field.'"
```

**Conclusión**: es un campo derivado. No es algo que Elyx pueda configurar mal; es la consecuencia
automática de la combinación elegida, y queda en `stripe`, que es lo que queremos.

### 5.3 La prueba más contundente: Stripe impide que Elyx asuma las pérdidas

Se intentó crear una cuenta con `losses_collector: 'application'` (Elyx responsable de las
pérdidas) para comprobar que la configuración es una elección y no una imposición:

```
account_creation_losses_collector_unavailable
"You tried to create a connected account with your platform as the losses collector.
 Set `defaults.responsibilities.losses_collector` to `stripe`, then retry your request.
 See https://docs.stripe.com/connect/risk-management/connected-accounts-with-managed-risk"
```

Esto no es documentación, **es la API negándose a la operación**. Con `dashboard: 'none'`, Elyx
**no puede** ser responsable de las pérdidas aunque quisiera.

### 5.4 `business_url` es obligatorio en México y `product_description` no basta

En la primera cuenta se prellenó solo `product_description`. La lista de requisitos siguió
incluyendo la URL:

```
defaults.profile.business_url        past_due   ← OBLIGATORIO
```

Se creó una segunda cuenta prellenando una URL pública de Elyx:

```js
defaults: { profile: { business_url: 'https://elyx-app.com/condominio/2' } }
```

**Resultado:**

```
Cuenta: acct_1UanT2DMdbafSDGb
dashboard: none
business_url: "https://elyx-app.com/condominio/2"

requisitos totales: 45
¿sigue pidiendo business_url? : NO (resuelto)
¿pide product_description?    : NO
```

**El requisito desaparece.** El condominio ya no tiene que inventar una página web: Elyx la
genera. Además, esa página pública sirve para las invitaciones, que ya son una funcionalidad del
producto, así que se convierte en una pieza con dos usos.

**Precisión sobre qué quedó demostrado:**

| Observación | ¿Verificado? |
|---|---|
| `product_description` **no** sustituye a `business_url` | ✅ Sí (cuenta 1: solo descripción → URL seguía en `past_due`) |
| Prellenar ambos **satisface** los requisitos públicos | ✅ Sí (cuenta 2: ninguno de los dos apareció en la lista) |
| Ambos sean **obligatorios** por separado en México | ⚠️ **No verificado**. En las dos cuentas se prellenó `product_description`, así que no se puede distinguir "no se requería" de "se satisfizo con el prellenado" |

La documentación advierte que la obligatoriedad depende del país y de otros detalles
(*"Stripe might require both"*), así que **la implementación debe prellenar los dos** para no
depender de esa distinción.

### 5.5 El onboarding embebido funciona sin dashboard

```
POST /v1/account_sessions          ← endpoint v1, aunque la cuenta sea v2
{
  account: 'acct_1UanT2DMdbafSDGb',
  components: {
    account_onboarding:  { enabled: true },
    account_management:  { enabled: true },
    notification_banner: { enabled: true },
  },
}
→ OK, client_secret presente
→ componentes activos: account_management, account_onboarding, notification_banner
→ features: { disable_stripe_user_authentication: false,
              external_account_collection: true }
```

Dos observaciones para la implementación:

- `disable_stripe_user_authentication` queda **forzado a `false`**. La documentación explica que
  solo puede ser `true` cuando `requirements_collector` es `application`. Traducción: durante el
  onboarding habrá un popup de autenticación de Stripe (correo + código). Sigue siendo dentro de
  Elyx, pero es un paso extra que el condominio verá y que la UI debe anticipar.
- `external_account_collection: true` significa que el componente recoge la CLABE de depósito.

También se comprobó que el **Account Link** tradicional de onboarding (`v2.core.accountLinks`)
sigue funcionando con `dashboard: 'none'`, como respaldo si el componente embebido fallara.

### 5.6 El dashboard es inmutable

Se intentó cambiar el dashboard de una cuenta ya creada:

```
v2.core.accounts.update(acct, { dashboard: 'full' })
→ RECHAZADO: "You cannot change dashboard via API once it has been set."
```

Confirmado en dos cuentas distintas. La documentación lo respalda:

> *"The `dashboard` you specify when creating a connected account is **permanent**... To change a
> connected account's dashboard, you must create a new `Account` object."*

**Esto no es un problema en este momento**: el usuario confirmó que la cuenta que intentó crear
Luis **no se creó** (falló por la URL), y no hay ningún cliente real con cuenta activa. La ventana
para decidir es ahora; después de tener condominios onboardeados, cambiar implicaría repetir el
KYC completo de cada uno.

### 5.7 Depósitos (payouts) y tarjeta guardada: viables

Segunda ronda de verificación, contra la cuenta `acct_1UanT2DMdbafSDGb` (`dashboard: 'none'`).
Se hizo porque el plan dependía de dos funcionalidades que no estaban confirmadas.

**a) La capacidad de depósitos se solicita sola.**

Se consultó la cuenta recién creada y `stripe_balance.payouts` ya estaba presente:

```
capabilities del config merchant:
  "stripe_balance": {
    "payouts": {
      "status": "restricted",
      "status_details": [{ "code": "requirements_past_due", "resolution": "provide_info" }]
    }
  }
```

`restricted` significa que existe y está pendiente el KYC, no que falte pedirla. La
documentación lo confirma: *"Adding the `merchant` configuration to an `Account` automatically
requests the merchant configuration's `stripe_balance.payouts` capability, even if you don't
request any other merchant capability."* **No hay que solicitar nada en el código.**

**b) La API de payouts funciona con `dashboard: 'none'`.**

```
stripe.payouts.list({ limit: 5 }, { stripeAccount: CONNECTED })
→ OK. payouts devueltos: 0  (la API respondió; la cuenta no tiene movimientos)

stripe.balance.retrieve({}, { stripeAccount: CONNECTED })
→ OK. available: [{ "amount": 0, "currency": "mxn", "source_types": { "card": 0 } }]
```

**Trampa encontrada**: `stripe.balance.retrieve({ stripeAccount })` (la cuenta conectada como
primer argumento) falla con `parameter_unknown: Received unknown parameter: stripeAccount`. La
cuenta conectada va en las **opciones**, no en los parámetros: `retrieve({}, { stripeAccount })`.

**c) Los cinco tipos de evento de payout son válidos.**

Se creó un destino de eventos temporal con esos nombres y Stripe lo aceptó; luego se eliminó:

```
payout.created, payout.updated, payout.paid, payout.failed, payout.reconciliation_completed
```

> *"Regardless of the Accounts API version that you use, payouts trigger only the v1 events
> described here. They don't have equivalent v2 events."*

Es decir, los eventos de payout de una cuenta v2 llegan como eventos v1, y viajan en el scope
"Connected accounts", que es **el mismo webhook que ya existe**.

**d) Estado actual del webhook en el Dashboard.**

```
https://elyx-app.com/api/webhooks/stripe/connect
  status: enabled | eventos: 2
  checkout.session.completed, account.updated
```

Hay que **agregar los eventos `payout.*` a ese destino** en el Dashboard. Es un cambio de
configuración, no de código, y sin él los depósitos nunca se verían en Elyx.

**e) La tarjeta guardada sí funciona con el checkout embebido.**

Se creó un `Customer` **en la cuenta conectada** y dos sesiones con
`saved_payment_method_options: { payment_method_save: 'enabled' }`:

```
Customer creado EN LA CUENTA CONECTADA: cus_Vc3Qc0QvV5oFFh
OK  ui_mode=embedded_page -> client_secret=presente
OK  ui_mode=form          -> client_secret=presente
```

**Esto elimina el riesgo de la Fase 4**: no hace falta migrar de `embedded_page` a `form`.

**f) `link_payments` se puede solicitar en una cuenta sin dashboard.**

```
OK. capabilities tras solicitar link_payments:
  link_payments: {"status":"restricted", ...}
  card_payments: "restricted"
```

Queda en `restricted` por el KYC pendiente, pero la solicitud se acepta. Es necesario hacerlo
explícitamente: con `dashboard: 'none'` Stripe cae en la columna *"Express or other Dashboard"*
de la tabla de capacidades, donde dice *"you must request payment method capabilities for them"*.
Con `full` se activaban solas.

**Conclusión: los depósitos son viables.** No hay que degradar el plan a "sin payouts".

### 5.8 Lo que no se pudo verificar empíricamente

**Un contracargo end-to-end con dinero real en test.** Dos bloqueos:

1. Requiere KYC completo, que necesita documentos reales o la UI de onboarding con una persona.
   Los datos ficticios por API fallaron: `id_number_invalid` (el RFC mexicano valida checksum) e
   `identity.representative: Unknown field` (la representación legal no se actualiza así).
2. La API de datos de tarjeta cruda está deshabilitada en la cuenta:
   *"Sending credit card numbers directly to the Stripe API is generally unsafe."*

Aun así la conclusión es sólida por tres vías independientes: la API **declara**
`losses_collector: 'stripe'`, la API **rechaza** lo contrario, y la documentación lo confirma con
la tabla de responsabilidades (sección 6).

**Un payout real.** `payouts.list` respondió, pero devolvió una lista vacía porque la cuenta no
tiene movimientos (el KYC está incompleto y no se puede cobrar). Queda pendiente confirmar el
`payload` de un evento `payout.paid` real; la estructura del objeto está documentada
(`amount`, `arrival_date`, `status`, `currency`, `method`, `type`).

---

## 6. Citas textuales de la documentación oficial

Todas de `docs.stripe.com`, consultadas el 2026-11-11.

### 6.1 KYC y pérdidas

Tabla de responsabilidades en *Risk and liability management with Connect*, columna
**"Stripe is responsible"**:

> *"**Losses**: Stripe covers losses due to your connected accounts' negative balances."*

> *"**Know Your Customer (KYC) requirements**: Stripe is responsible for collecting KYC
> information from your connected accounts."*

> *"**Operational responsibilities**: Stripe risk teams manage all payments-related connected
> account risk."*

> *"**Reserve funds**: Stripe doesn't hold reserves on your platform account to cover negative
> connected account balances."*

Cómo verificar la responsabilidad:

> *"You can identify whether Stripe or your platform is responsible for a connected account's
> negative balances… **Accounts v2:** `defaults.responsibilities.losses_collector` … In both
> versions, if Stripe is responsible, the value is `stripe`, and if your platform is responsible,
> the value is `application`."*

### 6.2 Contracargos con direct charges

> *"For disputes on payments created using direct charges, Stripe debits the disputed amount from
> the connected account's balance, not your platform's balance."*

> *"For connected accounts that use direct charges, Stripe always attempts to debit disputed
> amounts from the connected account's balance. **However, if Stripe can't debit the amount,
> ultimate responsibility depends on whether Stripe or the platform is responsible for negative
> balances.**"*

Tabla resumen de *Disputes on Connect platforms*:

| Comportamiento | Direct charges |
|---|---|
| Cuenta que se usa para responder la disputa | Cuenta conectada |
| Balance debitado por el monto disputado | Cuenta conectada |
| Cuenta debitada por las comisiones de disputa | Según la configuración de comisiones |

### 6.3 Quién paga la comisión por disputa

Tabla de *Fee behavior on connected accounts*:

| Configuración de la cuenta | Quién paga la comisión por disputa |
|---|---|
| v2 con `fees_collector = application` | Plataforma |
| v2 con `fees_collector = stripe` | **Cuenta conectada** |
| v2 con `fees_collector = application_custom` / `application_express` | Cuenta conectada |

### 6.4 Direct charges y reembolsos

> *"Refunds and chargebacks reduce the connected account's balance."*
> *"You create a charge on your connected account, so the payment appears in the connected
> account's balance, not in your platform's balance."*

### 6.5 ⚠️ Condición: la garantía depende de usar direct charges

> *"**Marketplace liability**: Connected account balance liability applies **only to connected
> account balances**. It doesn't affect negative platform balances caused by transactions related
> to **indirect charges**. If you use indirect charges, assign negative balance responsibility to
> your platform, not to Stripe."*

**Es la cita más importante para el futuro del proyecto.** Todo lo verificado en este documento
depende de seguir usando direct charges:

| Modelo | Quién absorbe un contracargo |
|---|---|
| **Direct charge** (el actual) | Stripe / el condominio ✅ |
| Destination charge | **Elyx** ❌ |
| Separate charges and transfers | **Elyx** ❌ |

Si en algún momento se migrara a destination charges, **todas las garantías de este documento
desaparecen**. Ver sección 10 (invariantes).

### 6.6 Prellenado de información

> *"If you onboard an account and your platform provides it with a URL, prefill the account's
> `defaults.profile.business_url`. If the business doesn't have a URL, prefill its
> `defaults.profile.product_description`. Depending on the account's country and other details,
> Stripe might require both."*

> *"The onboarding interface asks the account holder to confirm the pre-filled information before
> accepting the Connect service agreement."*

**Nota**: se verificó que prellenar la URL resuelve ese requisito (5.4). Cuál de los dos es
obligatorio por separado en México **no quedó determinado** (en las dos cuentas de prueba se
prellenaron ambos), así que la implementación prellenará **los dos**.

### 6.7 Por qué no se recolecta el KYC por nuestra cuenta

De *Design an advanced Connect integration*, sobre construir el flujo de onboarding uno mismo:

> *"You manage risk with full responsibility for negative balance liabilities."*

> *"You must keep your flows up to date as verification requirements change… Review and update
> onboarding requirements at least every six months."*

> *"**Tos acceptance**: `tos_acceptance_on_behalf_not_allowed` — TOS cannot be accepted on behalf
> of accounts when requirement collection is `stripe`."*

Y sobre `disable_stripe_user_authentication`, la única forma de aceptarlo:

> *"This value can only be true for accounts where `defaults.responsibilities.requirements_collector`
> is `application`."*
> *"…you assume liability for connected accounts if they can't pay back negative balances."*

**Conclusión: recolectar el KYC nosotros cambiaría un problema de UX por una responsabilidad
regulatoria y financiera permanente**, en una plataforma que además cobra 0% de comisión. No hay
ingreso que lo justifique.

---

## 7. Matriz de decisión

| Criterio | `full` (actual) | `express` | `none` (elegido) | KYC propio |
|---|---|---|---|---|
| Condominio sale de Elyx | Sí | Sí | **No** | No |
| Ve el dashboard de Stripe | Sí (completo) | Sí (limitado) | **No** | No |
| Ve Radar / Tax / Climate | Sí | Sí | **No** (a confirmar) | No |
| Necesita página web propia | Sí | Sí | **No** (Elyx la prellena) | No |
| Stripe hace el KYC | Sí | Sí | **Sí** | **No** |
| Stripe absorbe las pérdidas | Sí | **No** | **Sí** | **No** |
| Puede reactivar MSI solo | Sí | Sí | **No** | No |
| Esfuerzo de integración | Hecho | Bajo | Medio | **Muy alto** |
| Responsabilidad regulatoria para Elyx | No | **Sí** | **No** | **Sí** |

`none` es la única columna que cumple los cuatro objetivos simultáneamente: **el condominio se
queda en Elyx, Stripe conserva el KYC y las pérdidas, y Elyx no asume riesgo.**

---

## 8. La decisión

**Migrar a `dashboard: 'none'` con onboarding y gestión embebidos.**

> *"Creo que lo mejor sí va a ser ir por `dashboard: none`."* — decisión del usuario, 2026-11-11

### 8.1 Qué se va a cambiar

| Archivo | Cambio |
|---|---|
| `connect.service.ts` | `dashboard: 'full'` → `'none'` |
| `connect.service.ts` | Agregar `defaults.profile.business_url` con URL pública por condominio |
| `connect.service.ts` | Agregar `defaults.profile.product_description` |
| `connect.service.ts` | Nuevo método para crear Account Sessions (`v1/account_sessions`) |
| `connect.service.ts` | El `crearEnlaceOnboarding` queda como respaldo, no como camino principal |
| `connect.service.ts` | Solicitar `link_payments` (con `dashboard: 'none'` no se activa sola) |
| `connect.service.ts` | Bloquear la creación si faltan los datos de contacto del condominio |
| `cobros.controller.ts` | Nuevo endpoint `POST /api/cobros/connect/sesion` |
| `cobros.controller.ts` | Nuevo endpoint `GET /api/cobros/depositos` |
| `cobros-stripe.service.ts` | `Customer` en la cuenta conectada + `saved_payment_method_options` |
| `stripe-connect-webhook.controller.ts` | Casos `payout.created/updated/paid/failed` |
| `cobros.service.ts` | Al configurar Connect, prellenar también datos públicos |
| Nueva migración | `condominios` (contacto), `condominos_clientes_stripe`, `depositos_condominio` |
| Frontend | Nueva dependencia `@stripe/connect-js` |
| Frontend | Componente `OnboardingConnect` que monta `account-onboarding` |
| Frontend | Componente de gestión con `account-management` y `notification_banner` |
| Frontend | Rutas `/connect/return` y `/connect/refresh` (**hoy no existen**) |
| Frontend | `ConfiguracionCobroPanel` deja de redirigir a Stripe y monta el componente |
| Frontend | Bloque de depósitos en `finanzas` |
| Nueva página | `CondominioPublicoPage` en `/condominio/:id` (`noindex`) |
| Nueva página | `PoliticaPagosPage` en `/politica-pagos` (reembolsos y disputas) |
| Frontend | `InvitacionPage` deja de ser un formulario y pasa a ser la página pública |
| Docs | README y `estructura-proyecto.md` |

### 8.1.1 La página pública: qué se muestra y qué no

Stripe exige en la web del negocio, según su
[FAQ de activación](https://support.stripe.com/questions/business-website-for-account-activation-faq):

1. **Nombre del negocio.**
2. **Descripción de los bienes o servicios** ofrecidos.
3. **Datos de contacto de atención al cliente** (teléfono, correo, dirección, formulario o
   mensajería).
4. **Política de reembolsos y disputas.**
5. Debe **cargar sin contraseña**.
6. Debe estar completa (no "en construcción").

Además el negocio debe existir realmente: *"You are required to maintain a functioning website
with the appropriate information at all times. Stripe regularly checks that the provided website
is compliant."*

**Decisión del usuario**: mostrar solo lo que Stripe necesita y lo mínimo para que el condómino
reconozca que es su condominio.

| Se muestra | Se omite |
|---|---|
| Nombre del condominio | Dirección exacta (calle y número) |
| Descripción de los servicios (cobro de cuotas de mantenimiento) | Datos personales del administrador |
| Correo y teléfono de contacto del condominio | Lista de unidades |
| Resumen de qué es Elyx | Nombres de condóminos |
| Enlace a la política de pagos | Cualquier importe o cuota |

La página lleva `noindex` (meta robots + `robots.txt`) para no aparecer en buscadores, pero
**sigue siendo accesible sin autenticación**, que es lo que Stripe verifica.

### 8.2 Qué se reemplaza

| Antes | Después |
|---|---|
| Redirección a `connect.stripe.com/setup/...` | Componente `account-onboarding` montado en Elyx |
| `accountLinks.create` de tipo `account_onboarding` | `accountSessions.create` con `components` |
| Dashboard completo de Stripe para el condominio | Solo lo que Elyx le muestre |
| El condominio configura MSI en Stripe | Solo Elyx lo controla (`permitir_msi`) |
| `return_url` / `refresh_url` apuntando a rutas inexistentes | `onExit` del componente + rutas reales |
| Condominio inventa una URL | Elyx la prellena con su página pública |

### 8.3 Qué NO se cambia

Se recalca porque es donde es fácil equivocarse al implementar:

- **Direct charges.** Nada de destination charges (ver 10.1).
- `fees_collector: 'stripe'` y `losses_collector: 'stripe'`.
- El monto del cargo: exactamente el de la cuota, sin recargos.
- `permitir_msi` por defecto en `false`.
- El webhook `/api/webhooks/stripe/connect` y su secreto separado.
- La lectura de la comisión real desde `balance transaction`.
- El camino SPEI completo, que no toca Stripe.

---

## 9. Consecuencias y riesgos que se aceptan

| # | Consecuencia | Mitigación |
|---|---|---|
| 1 | El condominio **no puede ver sus depósitos** en ningún lado salvo su banco o Elyx | Integrar `payouts` y mostrar los depósitos en Elyx (verificado viable, 5.7) |
| 2 | **Elyx es la primera línea de soporte** para disputas y reembolsos | Correos de soporte de Elyx; evaluar `disputes-list` si crece |
| 3 | El onboarding muestra **un popup de autenticación de Stripe** (correo + código) | Anticiparlo en la UI: explicar que es un paso de verificación |
| 4 | **No hay vuelta atrás** por cuenta: el dashboard es inmutable | Aceptado; no hay clientes reales todavía |
| 5 | Más trabajo de integración que el onboarding hospedado | Asumido; es la única vía para los objetivos |
| 6 | Puede que Radar/Tax/Climate **sigan apareciendo** en el componente | Fallback documentado: `collectionOptions.requirements.exclude` |
| 7 | El condominio ya no puede **desactivar** su cuenta desde Stripe | Elyx debe ofrecer ese camino o documentar el soporte |
| 8 | El **webhook del Dashboard** hay que ampliarlo con los eventos `payout.*` | Es configuración, no código; sin esto los depósitos no se ven |
| 9 | Stripe puede **verificar la propiedad del dominio** de la página pública | La página debe estar publicada en el dominio real antes de crear cuentas |
| 10 | La verificación de Stripe es **continua**: si la página deja de cumplir, avisan | La página se genera desde campos obligatorios del condominio |

**Efecto secundario positivo**: al desaparecer el dashboard, el condominio **ya no puede reactivar
MSI**, que era un riesgo aceptado en el plan original. Con `dashboard: 'none'` el control de MSI
queda enteramente en manos de Elyx.

---

## 10. Invariantes del proyecto

Estas reglas deben respetarse en cualquier cambio futuro; romperlas invalida las garantías de este
documento.

### 10.1 Usar solo **direct charges**

Cualquier cambio a destination charges o a separate charges and transfers transfiere a Elyx la
responsabilidad de los contracargos (ver 6.5). Si algún día se necesita ese modelo, hay que
reabrir esta decisión y evaluar el riesgo financiero.

### 10.2 Mantener `fees_collector: 'stripe'` y `losses_collector: 'stripe'`

Si se cambia cualquiera de los dos a `application`, Elyx asume comisiones o pérdidas. Stripe
incluso lo rechaza con `dashboard: 'none'`, lo cual es una red de seguridad, pero el código no
debe intentarlo.

### 10.3 No aceptar términos de servicio en nombre del condominio

`tos_acceptance_on_behalf_not_allowed`. Con `requirements_collector: 'stripe'` es Stripe quien
recoge la aceptación.

### 10.4 No crear cuentas con `dashboard: 'express'`

Obliga a `losses_collector: 'application'`, es decir, a que Elyx absorba los contracargos.

### 10.5 Siempre prellenar `business_url`

Sin ella, en México el onboarding se bloquea. La URL debe ser estable y pública.

---

## 11. Pendientes antes y durante la implementación

| # | Pendiente | Estado | Cómo se resuelve |
|---|---|---|---|
| 1 | ¿Desaparecen Radar / Tax / Climate con `dashboard: 'none'`? | **Abierto (manual)** | El iframe de Stripe no carga en el navegador automatizado (13.3). Abrirlo en un navegador normal; si no desaparecen, `collectionOptions.requirements.exclude` |
| 2 | Contracargo real end-to-end | **Abierto** | Completar el KYC en test con la UI y usar la tarjeta `4000000000000259` |
| 3 | Página pública por condominio | **Resuelto** | `/condominio/:id` con `noindex`; contenido en 8.1.1 |
| 4 | Depósitos del condominio | **Resuelto** | `DepositosService` + panel en Gastos y reportes (13.2) |
| 5 | Manejo de disputas sin dashboard | **Definido** | Correos de soporte de Elyx; `disputes-list` queda como mejora futura |
| 6 | Rutas `/connect/return` y `/connect/refresh` | **Resuelto** | `pages/public/ConnectReturnPage.tsx` |
| 7 | Migración de cuentas existentes | **No aplica** | No hay cuentas con clientes reales |
| 8 | Agregar `payout.*` al webhook del Dashboard | **Pendiente (config)** | Dashboard → Webhooks → endpoint de Connect: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.reconciliation_completed`. Sin ellos el cron de las 6:15 y el botón «Actualizar» siguen cubriendo el caso |
| 9 | Confirmar el `payload` de un `payout.paid` real | **Abierto** | Requiere un payout real; la estructura está documentada |

### 11.1 Correcciones necesarias en el flujo de invitaciones

Detectadas al explorar el código para rediseñar la página pública. Se corrigen en la misma
migración porque comparten archivos:

| # | Problema | Evidencia |
|---|---|---|
| 1 | `ConfirmarInvitacionPage` **no envía `captchaToken`** y el endpoint tiene `TurnstileGuard` → con `TURNSTILE_ENABLED=true` la confirmación responde **400** | `apps/frontend/src/pages/public/ConfirmarInvitacionPage.tsx` |
| 2 | La **contraseña temporal se descarta**: si alguien deja la contraseña vacía, la cuenta queda con `requiere_cambio_password=true` pero nadie la conoce | `invitaciones.service.ts:283-291` |
| 3 | `rechazarSolicitud` **no notifica** al solicitante, aunque el tipo `SOLICITUD_ALTA_RECHAZADA` existe en el CHECK | `invitaciones.service.ts:393-425` |
| 4 | `es_cuenta_existente` se calcula pero **no se usa** en ninguna decisión | `invitaciones.service.ts:505-509` |

No se tocan (se documentan como deuda preexistente): el IDOR potencial en aprobar/rechazar, la
falta de índice único de ocupante activo y la ausencia de cron de expiración.

---

## 12. Anexos

### 12.1 Cuentas de prueba creadas durante la verificación
Todas en **modo test**, sin efecto en producción:

| Cuenta | Configuración | Propósito |
|---|---|---|
| `acct_1UanPUDMdbCBkHgR` | `dashboard: none`, solo `product_description` | Confirmar que la URL seguía pendiente |
| `acct_1UanT2DMdbafSDGb` | `dashboard: none` + `business_url` de Elyx + `link_payments` | Confirmar que el requisito desaparece y verificar payouts |

Clientes de prueba creados en la cuenta conectada (modo test): `cus_Vc3Px2y8EYepSn`,
`cus_Vc3PgMBoB2mrUy`, `cus_Vc3Qc0QvV5oFFh`. Destinos de webhook temporales creados y eliminados
durante la validación de tipos de evento.

### 12.2 Scripts reproducibles

**`scripts/verificar-dashboard-none.js`** — secciones 5.1 a 5.6: creación con `dashboard: 'none'`,
responsabilidades, requisitos, Account Session, Account Link e inmutabilidad.

**`scripts/verificar-payouts.js`** — sección 5.7: capacidad de payouts auto-solicitada,
`payouts.list`, `balance.retrieve`, validez de los tipos `payout.*` y
`saved_payment_method_options` con `embedded_page` y `form`.

```powershell
docker cp scripts/verificar-payouts.js elyx-backend:/app/vp.js
docker exec -w /app elyx-backend node vp.js
docker exec elyx-backend rm -f /app/vp.js
```

Ambos scripts abortan si la llave no es `sk_test_`, para no tocar cuentas reales por accidente.

**`scripts/verificar-tarjeta-guardada.js`** — Fase 4: crea un `Customer` en la cuenta conectada,
confirma que **no** existe en la cuenta plataforma (direct charges) y valida la combinación real de
la app (`saved_payment_method_options.payment_method_save = 'enabled'` +
`payment_intent_data.setup_future_usage = 'on_session'`) en dos sesiones consecutivas.

```powershell
docker cp scripts/verificar-tarjeta-guardada.js elyx-backend:/app/vtg.js
docker exec -w /app elyx-backend node vtg.js [acct_...]
docker exec elyx-backend rm -f /app/vtg.js
```

**`scripts/probar-webhook-connect.js`** — envía eventos firmados al webhook de Connect para probar
la confirmación de cargos y los eventos asíncronos.

**`scripts/probar-webhook-payouts.js`** — Fase 5: envía `payout.created`, `payout.paid`,
`payout.failed` y `payout.updated` firmados, comprueba la idempotencia con un evento repetido y
que una cuenta ajena no crea filas.

```powershell
docker cp scripts/probar-webhook-payouts.js elyx-backend:/app/pwp.js
docker exec -w /app elyx-backend node pwp.js [acct_...]
docker exec elyx-backend rm -f /app/pwp.js
```

**`scripts/verificar-cuenta-final.js`** — Fase 6: crea una cuenta v2 con los parámetros reales de
`connect.service.ts` y comprueba `dashboard: 'none'`, las tres responsabilidades en `stripe`, las
capacidades pedidas, que **ningún requisito pida `business_url`**, la Account Session del onboarding
embebido y el Account Link de respaldo. Cierra la cuenta al terminar.

```powershell
docker cp scripts/verificar-cuenta-final.js elyx-backend:/app/vcf.js
docker exec -w /app elyx-backend node vcf.js
docker exec elyx-backend rm -f /app/vcf.js
```

### 12.3 Referencias de código

| Tema | Archivo |
|---|---|
| Creación de cuenta y onboarding | `apps/backend/src/modules/cobros/connect.service.ts` |
| Direct charges, Customer y confirmación | `apps/backend/src/modules/cobros/cobros-stripe.service.ts` |
| Webhook de Connect | `apps/backend/src/modules/cobros/stripe-connect-webhook.controller.ts` |
| Cliente de Stripe y secretos | `apps/backend/src/modules/suscripciones/stripe-client.service.ts` |
| Configuración de cobro (frontend) | `apps/frontend/src/components/ConfiguracionCobroPanel.tsx` |
| Checkout embebido | `apps/frontend/src/components/CheckoutEmbebido.tsx` |
| Modal de pago de cuota | `apps/frontend/src/components/PagoCuotaModal.tsx` |

### 12.4 Documentación oficial consultada

- `docs.stripe.com/payments/checkout/save-during-payment` — guardar y reutilizar tarjetas en el
  formulario embebido (solo tarjetas; requiere `customer`)
- `docs.stripe.com/api/checkout/sessions/create` — `saved_payment_method_options`,
  `payment_intent_data.setup_future_usage`
- `docs.stripe.com/api/v2/core/accounts/create` — parámetro `dashboard` y códigos de error
- `docs.stripe.com/api/v2/core/accounts/object` — atributos `dashboard` y `responsibilities`
- `docs.stripe.com/connect/risk-management` — tabla de responsabilidades y KYC
- `docs.stripe.com/connect/disputes` — quién responde y quién paga las disputas
- `docs.stripe.com/connect/direct-charges-fee-payer-behavior` — tabla de comisiones
- `docs.stripe.com/connect/charges` — tipos de cargo y flujo de fondos
- `docs.stripe.com/connect/embedded-onboarding` — prellenado y Account Sessions
- `docs.stripe.com/connect/supported-embedded-components/account-onboarding` — `collectionOptions` y `StepChange`
- `docs.stripe.com/connect/design-an-integration` — escenarios de dashboard
- `docs.stripe.com/connect/get-started-connect-embedded-components` — Account Sessions

---

## 13. Estado de implementación

### 13.1 Fase 4 — tarjeta guardada (completa, 2026-11-13)

**Qué se hizo**

- `CobrosStripeService.asegurarCliente()` crea o reutiliza el `Customer` **en la cuenta
  conectada** (`{ stripeAccount }`). Se mapea por `(id_condominio, id_usuario_condominio)` en
  `condominos_clientes_stripe`; nunca por usuario, porque la misma persona en otro condominio usa
  otra cuenta y otro Customer.
- La membresía se toma del JWT (`memberships[].idUsuarioCondominio`) en `CobrosController` y se
  propaga a `CobrosService.datosPagoCuota()` y a `crearCobroTarjeta()`. Es la traducción
  `sub` → membresía que ya se usa en invitaciones.
- La sesión se crea con `customer`, `saved_payment_method_options.payment_method_save =
  'enabled'` y `payment_intent_data.setup_future_usage = 'on_session'`.
- Si el Customer falla (Stripe caído, membresía inactiva), el cobro **sigue funcionando** sin
  tarjeta guardada: `asegurarCliente()` nunca lanza.
- `DatosPagoCuota` expone `tarjetaGuardada` y `guardarTarjeta`; `PagoCuotaModal` avisa al
  condómino en ambos casos.

**Por qué `on_session` y no `off_session`**: `on_session` adjunta la tarjeta al Customer sin crear
un mandato de cobro automático. `off_session` permitiría cobrarle al condómino sin que esté
presente, que es justo lo que no se le promete al ofrecerle guardar la tarjeta.

**Verificación (cuenta de test `acct_1Ub9fHDMdbqDU7B3`, condominio 2, membresía 7)**

```
GET /api/cobros/cuota/26?idCondominio=2   (JWT de la condómina)
→ { "tarjetaGuardada": false, "guardarTarjeta": true, "clientSecret": "cs_test_..." }

condominos_clientes_stripe
→ (2, 7, cus_VcOljG9G7KlrS8)

Stripe (cuenta conectada)
→ checkout session cs_test_a0js... customer = cus_VcOljG9G7KlrS8
→ saved_payment_method_options = { payment_method_save: "enabled", ... }

Segunda llamada (misma cuota, sesión viva)
→ mismo clientSecret, "tarjetaGuardada": true   (no se creó otra sesión ni otro Customer)
```

**Pendiente de comprobar en navegador**: que la tarjeta guardada aparezca visualmente en la
segunda compra. Requiere completar un pago real en el formulario embebido, y el KYC de la cuenta
de test sigue `restricted`; el `Customer` y las opciones de la sesión ya están verificados por API.

### 13.3 Fase 6 — verificación final (completa, 2026-11-13)

**Matriz de verificación**

| # | Punto del plan | Resultado | Evidencia |
|---|---|---|---|
| 1 | Migración idempotente + espejo validado | ✅ | Aplicada 3 veces sobre una BD temporal con `ON_ERROR_STOP=1`: exit 0 y solo `NOTICE ... already exists`. Columnas, tipos, nulabilidad, defaults y constraints **idénticos** entre el espejo (`01_schema.sql`) y la BD migrada |
| 2 | Página pública cumple los 6 puntos de la FAQ de Stripe | ✅ | Nombre, descripción, correo y teléfono, enlace a la política, carga sin credenciales y está completa. `robots: noindex, nofollow` + `Disallow` en `robots.txt` |
| 3 | Enlaces viejos `/invitacion/<token>` siguen funcionando | ✅ | Con token revocado muestra la página pública + «enlace desactivado»; con token válido muestra la sección de unión |
| 4 | Unión autenticada → `VERIFICADA` sin correo | ✅ | `POST /invitaciones/publica/:token/unirse` → fila `VERIFICADA` con `verificado_en = NOW()` y sin `password_hash`; aprobar crea membresía + ocupación |
| 5 | `business_url` desaparece de `requirements.entries` | ✅ | Cuenta nueva con los parámetros reales: 45 requisitos, **ninguno** pide `business_url` |
| 6 | Onboarding embebido monta | ⚠️ Parcial | El `<stripe-connect-account-onboarding>` y su iframe se crean en el DOM y el backend emite Account Sessions válidas; el navegador automatizado **no puede cargar** `connect-js.stripe.com` (`net::ERR_ABORTED`, igual que `challenges.cloudflare.com`), así que el contenido interno no se pudo ver |
| 7 | Radar/Tax/Climate desaparecen | ⏳ Manual | Requiere abrir el onboarding en un navegador normal; sin conexión a connect-js no hay nada que inspeccionar |
| 8 | Tarjeta guardada visible en la segunda compra | ⚠️ Parcial | `Customer` + `payment_method_save` + `setup_future_usage: on_session` verificados en la sesión real; ver la tarjeta exige completar un pago, y el KYC de la cuenta de test sigue `restricted` |
| 9 | `payout.paid` firmado → fila en `depositos_condominio` | ✅ | 4 eventos firmados → 3 filas; repetido → `evento-duplicado`; cuenta ajena → `cuenta-desconocida` |
| 10 | Docs actualizados | ✅ | Este documento, `README.md` y `docs/estructura-proyecto.md` |

**Script de verificación**: `scripts/verificar-cuenta-final.js` crea la cuenta con los parámetros reales,
comprueba responsabilidades, capacidades, la ausencia de `business_url`, la Account Session y el
Account Link, y **cierra la cuenta** al terminar (`applied_configurations: ['merchant']`).

```
OK   dashboard = none
OK   fees_collector = stripe
OK   losses_collector = stripe
OK   requirements_collector = stripe
OK   card_payments existe
OK   link_payments existe
OK   ningun requisito pide business_url        (45 requisitos revisados)
OK   devuelve client_secret                    (accountSessions.create)
OK   devuelve URL de Stripe                    (accountLinks.create)
Cuenta de prueba cerrada
```

**Correcciones encontradas al verificar**

1. **`VistaCondominio` no distinguía a un miembro actual.** A quien ya pertenece al condominio se le
   ofrecía «Unirme» y, al pulsar, veía «Solicitud enviada» aunque el backend respondiera
   `YA_MIEMBRO`. Ahora, al recuperar la sesión se revisan las membresías y se muestra «Ya perteneces
   a este condominio» con un enlace de entrada. El estado se comprueba **antes** que el del enlace,
   porque un enlace revocado no le impide nada a quien ya está dentro.
2. **`ConnectOnboarding` cacheaba una instancia fallida.** `obtenerInstancia` guardaba la promesa de
   `loadConnectAndInitialize` incluso cuando se rechazaba, así que un fallo de red inicial dejaba el
   formulario en blanco hasta recargar la página. Ahora la promesa se descarta al fallar.
3. **`InvitacionesController` respondía 500 sin `idCondominio`.** El query param se convertía con
   `Number(...)` y llegaba `NaN` al SQL. Se cambió a `ParseIntPipe` en los cuatro endpoints del
   panel: ahora responde **400** con el parámetro faltante.

**Limitaciones que quedan abiertas (no son defectos del código)**

- El iframe de Stripe no se puede inspeccionar en el navegador automatizado de este entorno:
  `connect-js.stripe.com` devuelve `ERR_ABORTED`. La misma restricción afecta a Turnstile. La
  comprobación de Radar/Tax/Climate debe hacerse a mano en un navegador normal.
- El KYC de la cuenta de test sigue `restricted`, así que no se puede completar un pago ni generar un
  payout real.

### 13.4 Fase 5 — payouts / depósitos (completa, 2026-11-13)

**Qué se hizo**

- Nuevo `DepositosService` (`modules/cobros/depositos.service.ts`):
  - `registrarDesdeWebhook(payout, stripeAccountId)` resuelve el condominio por
    `event.account` y hace upsert por `stripe_payout_id`. Un mismo payout llega varias veces
    (`created`, `updated`, `paid`) y deja **una sola fila** con el estado más reciente.
  - `listar(idCondominio)` alimenta el panel del administrador.
  - `reconciliar(idCondominio)` compara contra `payouts.list({ limit: 100 }, { stripeAccount })`.
  - `@Cron('0 15 6 * * *')` reconcilia todas las cuentas conectadas (6:15, sin chocar con los
    crons de suscripciones de 2 a 5 AM).
- Webhook de Connect: casos `payout.created`, `payout.updated`, `payout.paid`, `payout.failed` y
  `payout.reconciliation_completed`. Los cinco traen un objeto `Payout` (verificado en
  `stripe-node`), así que comparten el mismo manejador.
- Endpoints `GET /api/cobros/depositos?idCondominio=` y `POST /api/cobros/depositos/reconciliar`.
- Frontend: `components/DepositosPanel.tsx` montado en **Gastos y reportes**, con totales
  (depositado / en camino), tabla por fecha de llegada y botón «Actualizar» que fuerza la
  reconciliación.

**Verificación (eventos firmados contra el webhook real, cuenta `acct_1Ub9fHDMdbqDU7B3`)**

```
payout.created  (payout A, pending)   -> procesado: true
payout.paid     (payout A, paid)      -> procesado: true   (misma fila, estado final paid)
payout.failed   (payout B)            -> procesado: true
payout.updated  (payout C, in_transit)-> procesado: true
payout.paid repetido                  -> procesado: false, motivo: evento-duplicado
payout.paid de una cuenta ajena       -> procesado: false, motivo: cuenta-desconocida

GET /api/cobros/depositos?idCondominio=2
-> 3 filas: A=paid 1800 MXN, B=failed 950 MXN, C=in_transit 500 MXN (card/instant)
POST /api/cobros/depositos/reconciliar?idCondominio=2
-> { revisados: 0, creados: 0, actualizados: 0 }   (la API respondió; la cuenta no tiene payouts)
```

**UI verificada en navegador**: el panel muestra los totales ($1,800 depositado / $500 en
camino), las tres filas con su chip de estado y el botón «Actualizar» responde «Stripe no
reporta depósitos todavía» cuando no hay movimientos reales.

**Límite conocido**: no se pudo crear un payout real porque la cuenta de test sigue `restricted`
(`charges_enabled: false` por KYC pendiente), así que el `payload` real de un `payout.paid` no se
observó. La forma del objeto está tomada del SDK (`stripe-node` 23.1.0) y los eventos firmados
con esa forma se procesan correctamente.

**Configuración manual pendiente**: agregar los cinco eventos `payout.*` al destino del webhook
de **Connected accounts** (`/api/webhooks/stripe/connect`) en el Dashboard de Stripe. Sin eso,
los depósitos solo aparecen por el cron de las 6:15 o al pulsar «Actualizar».

### 13.5 Fases anteriores

| Fase | Estado |
|---|---|
| 0 — migración (`20261112_connect_none_publico.sql`) | ✅ aplicada + espejo en `01_schema.sql` |
| 1 — página pública `/condominio/:id` + `/politica-pagos` | ✅ |
| 2 — unión desde la invitación + 4 bugs corregidos | ✅ |
| 3 — `dashboard: 'none'` + onboarding embebido + `link_payments` | ✅ |
| 4 — tarjeta guardada (`on_session`) | ✅ |
| 5 — payouts / depósitos | ✅ |
| 6 — verificación final y documentación | ✅ (con 2 comprobaciones manuales pendientes, 13.3) |
