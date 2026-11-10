# Estructura base de Elyx

## Monorepo

- `apps/frontend`: React + Vite
- `apps/backend`: NestJS + TypeORM
- `infra/postgres/init`: SQL de inicializacion
- `docs`: documentacion tecnica

## Backend por dominio

- `usuarios`
- `condominos`
- `administradores`
- `cuotas`
- `pagos`
- `recibos`
- `evidencias-pago`
- `avisos`
- `votaciones`
- `votos`
- `reportes-mantenimiento`
- `config-notificaciones`
- `notificaciones`
- `gastos`
- `reportes-financieros`
- `condominio-alta` (logica de alta compartida entre onboarding, registro publico e invitaciones)
- `cupo` (unico punto de verdad del cupo de unidades y de la operatividad del condominio)
- `registro` (alta publica "Crea tu condominio" + verificacion de correo)
- `invitaciones` (enlace general, solicitudes y aprobacion del administrador)
- `suscripciones` (cobro de la plataforma con proveedor intercambiable: MANUAL | STRIPE | NULL)
- `membresias` (cambio de rol con el guard de "ultimo administrador", compartido por el
  superusuario y la votacion de roles)
- `retencion` (aplica los plazos de conservacion de la politica de privacidad; solo cron)

## Tareas programadas

Todas viven en el backend y comparten `ScheduleModule`. Se reparten por hora para no competir
por conexiones a la base:

| Hora | Tarea | Que hace |
|---|---|---|
| cada hora | `RegistroService.purgarRegistrosVencidos` | Marca `EXPIRADO` los registros sin verificar |
| 2:00 AM | `SuscripcionesService.reconciliarConStripe` | Red de seguridad de los webhooks |
| 3:00 AM | `SuscripcionesService.suspenderVencidas` | Condominios con suscripcion vencida |
| 4:00 AM | `SuscripcionesService.purgarSinPago` | Borra condominios que nunca pagaron |
| 4:30 AM | `RetencionService.purgar` | Plazos de conservacion de datos |
| 5:00 AM | `SuscripcionesService.suspenderPorImpago` | Fin del periodo de gracia |

## Retencion de datos

`RetencionService` es la contraparte en codigo de la seccion 7 de
`docs/politica-privacidad.md`. Antes de existir, la politica prometia plazos que ningun
proceso cumplia.

- **Lo que purga**: `behavior_events` (30 dias), `intentos_login` (365 dias),
  `refresh_tokens` (30 dias despues de expirar o revocarse), `password_resets` usados o
  vencidos (7 dias) y `mfa_recovery_codes` consumidos (90 dias).
- **Lo que NO purga**: datos financieros. El plazo de 7 anios de cuotas, pagos, recibos y
  reportes es un **minimo** fiscal: no autoriza a borrar.
- Borra en lotes de 5000 filas con `DELETE ... WHERE ctid IN (SELECT ctid ... LIMIT n)`.
  `ctid` se usa porque el nombre de la clave primaria cambia por tabla. El tope de
  iteraciones evita un bucle infinito si una fila no se puede borrar.
- Cada tarea falla de forma aislada: una tabla ausente en una instalacion vieja no tumba
  las demas.

## Cabeceras de seguridad del API

`common/security/cabeceras-seguridad.ts` aplica `helmet` en `main.ts`, antes de CORS y de
los archivos estaticos.

- El API vive en **otro origen** que el frontend (`api.elyx-app.com` vs `elyx-app.com`), asi
  que no hereda las cabeceras de `nginx.conf`.
- `crossOriginResourcePolicy: 'cross-origin'` es obligatorio: el valor por defecto de helmet
  (`same-origin`) bloquearia las imagenes de `/uploads` servidas al frontend.
- CSP `default-src 'none'` sin `upgrade-insecure-requests`: un API devuelve JSON, y esa
  directiva romperia el desarrollo local sobre HTTP.
- `Cache-Control: no-store` en todo el API; `/uploads` queda excluido para no reenviar las
  imagenes en cada apertura.
- HSTS solo con `NODE_ENV=production`.

## Migraciones

Las migraciones viven en `apps/backend/src/database/migrations/` y se aplican **a mano**
(`psql`) o via `docker compose`; no hay runner automatico. Tambien estan reflejadas en
`infra/postgres/init/01_schema.sql` para que una instalacion nueva arranque completa.

| Archivo | Contenido |
|---|---|
| `20260501_password_resets.sql` | Recuperacion de contrasena |
| `20261010_intentos_login.sql` | Auditoria de intentos de inicio de sesion |
| `20261102_registro_publico.sql` | Ciclo de vida del condominio, `cupo_unidades`, `registros_condominio`, `invitaciones_condominio`, `solicitudes_alta_invitacion`, `suscripciones_condominio`, `pagos_suscripcion` |
| `20261103_votaciones_roles_stripe.sql` | `votaciones.tipo` + `votaciones_cambio_rol`, datos fiscales del condominio, columnas de Stripe, `stripe_eventos` |
| `20261104_stripe_items_suscripcion.sql` | `stripe_item_base_id`, `stripe_item_unidades_id`, `stripe_item_ajuste_id` (un id por concepto de cobro) |

## Base de datos

`infra/postgres/init/01_schema.sql` incluye tablas con base en el ER:

- usuarios, condominos, administradores
- estado_cuenta, cuotas, pagos
- evidencias_pago, recibos
- avisos, votaciones, votos
- reportes_mantenimiento
- config_notificaciones, notificaciones
- gastos
- reportes_financieros, reporte_financiero_detalle
- registros_condominio (alta publica pendiente de verificar)
- invitaciones_condominio, solicitudes_alta_invitacion
- suscripciones_condominio, pagos_suscripcion
- votaciones_cambio_rol (propuestas de ascenso/degradacion)
- stripe_eventos (idempotencia de webhooks)

## Reglas clave implementadas

- Sin pagos parciales: `pagos.id_cuota` es UNIQUE.
- Sin multiples evidencias por pago: `evidencias_pago.id_pago` es UNIQUE.
- Sin multiples recibos por pago: `recibos.id_pago` es UNIQUE.
- Voto unico por condominio y votacion: UNIQUE `(id_votacion, id_condomino)`.
- Detalle financiero con XOR: `id_pago` o `id_gasto` (uno y solo uno).

## Reglas de la votacion de roles

- El derecho a voto viene de **ocupar una unidad activa**, no del rol: un administrador sin
  unidad no vota; uno que vive en el condominio si.
- Los administradores **convocan**; no votan "como administradores".
- En una degradacion el afectado no vota; en un ascenso si puede votarse a si mismo.
- Quorum: mayoria de **todos** los habilitados (`floor(N/2)+1`), no de los votos emitidos.
  Se congela al crear la votacion (`votaciones.total_habilitados/votos_requeridos`).
- El resultado se aplica **automaticamente** al cerrar. Si viola el guard de ultimo
  administrador, la propuesta pasa a `RECHAZADA` con motivo en lugar de devolver error.
- `votaciones.tipo` es explicito (`GENERAL`, `CAMBIO_CUOTA`, `CAMBIO_ROL`); antes se derivaba
  del JOIN con la tabla de cambio de cuota, lo que no admitia un tercer tipo.

## Reglas de la suscripcion con Stripe

- Precio **neto** = `max(piso, base + (unidades × costo por unidad))`. El IVA se
  desglosa aparte (`tax_behavior: exclusive` con un Tax Rate del 16%).
  `suscripciones_condominio.monto` guarda el **neto**; el total cobrado vive en
  `pagos_suscripcion.monto`.
- El IVA **no es ingreso de Elyx**: se cobra, se retiene y se entera al SAT.
- Checkout **embebido** (`ui_mode: 'embedded_page'` en Stripe v23). Link es una cartera que
  aparece dentro del checkout; no se integra aparte y no soporta SPEI/OXXO recurrentes.
- Webhooks idempotentes por `stripe_eventos`: un evento se procesa una sola vez. Nunca se
  responde 5xx por un fallo de negocio (Stripe reintentaria en bucle); solo 400 si la firma
  es invalida.
- Reconciliacion diaria con la API de Stripe: los webhooks siempre pierden alguno.
- `vencida_desde` se fija en el **primer** fallo y no se reinicia con los reintentos; a los
  `SUSCRIPCION_DIAS_GRACIA` (7) dias el condominio pasa a `SUSPENDIDO`.
- **Que bloquea `SUSPENDIDO` (y `PENDIENTE_PAGO`, `INACTIVO`)**: solo el **crecimiento**.
  `CupoService.assertCondominioOperativo()` se llama desde altas de condominos, generacion de
  invitaciones, envio de solicitudes publicas y aprobacion de solicitudes. La operacion diaria
  (pagos, cuotas, avisos, gastos, votaciones) sigue funcionando a proposito: bloquear el cobro de
  cuotas castigaria a los condominos por el impago del administrador. El login tambien sigue
  permitido para que el administrador vea el estado y regularice.
- Sin `STRIPE_SECRET_KEY`, `SUSCRIPCION_PROVIDER=STRIPE` degrada a `MANUAL` en vez de romper
  el arranque.

### Items del checkout (importante)

El `max` del piso **no se puede expresar con dos lineas**, asi que el checkout usa hasta tres:

| # | Item | Cantidad | Columna del id |
|---|------|----------|----------------|
| 0 | Cuota base | 1 (fija) | `stripe_item_base_id` |
| 1 | Unidades | `unidades` | `stripe_item_unidades_id` |
| 2 | Ajuste a cuota minima | 1 (solo si aplica el piso) | `stripe_item_ajuste_id` |

Sin la tercera linea, con 5 unidades Stripe cobraria 235 mientras la app muestra 250: el
cliente paga de menos y la factura no cuadra con la suscripcion guardada.

- Cambiar la cantidad de **unidades** se hace solo sobre `stripe_item_unidades_id`. Hacerlo
  sobre el primer item (que es la base) multiplicaba la cuota base por el numero de unidades.
- `stripe_item_base_id` es informativo: su cantidad nunca debe cambiar.
- `subscriptionItems.create/update` con `price_data` exige `product` (id), no `product_data`.
  El producto de ajuste se busca o crea una vez en `StripeClientService.obtenerProductoAjuste()`.
- `stripe_subscription_item_id` se conserva como respaldo del item de unidades para
  suscripciones creadas antes de la migracion `20261104_stripe_items_suscripcion.sql`.
- Al subir unidades el piso deja de aplicar: la linea de ajuste se **elimina** de la
  suscripcion (`subscriptionItems.del`), no se deja en cero.

## Reglas del registro e invitaciones

- `condominios.cupo_unidades` es el maximo de unidades que pueden **existir** (licencia).
  `NULL` = sin limite (condominios creados por el superusuario o instalaciones sin cobro).
- Unidad **libre** = unidad ACTIVA sin ocupacion activa. Ese es el asiento que reclama
  un condomino a traves del enlace.
- Una persona puede ser ADMINISTRADOR y ocupante de una o varias unidades con la misma
  cuenta: no se crean cuentas duplicadas.
- El rol nunca se degrada por un alta: `ensureMembresia` solo asciende a ADMINISTRADOR.
- No se puede degradar al ultimo administrador activo de un condominio.
- Solo puede existir **una** invitacion ACTIVA por condominio (indice unico parcial);
  regenerar el enlace revoca el anterior con motivo `ROTADA`.
- Al aprobar la solicitud que consume la ultima unidad libre, la invitacion pasa a
  `REVOCADA` con motivo `CUPO_AGOTADO` y se notifica al administrador.
- Codigo de verificacion y de confirmacion: solo se guarda su **SHA-256**, nunca el token
  en claro. `password_resets` (heredado) sigue guardando el token en claro.
