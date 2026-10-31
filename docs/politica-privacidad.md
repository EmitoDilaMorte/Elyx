# Política de Privacidad de Elyx

**Última actualización:** Octubre 2026

En **Elyx**, nos comprometemos a proteger la privacidad de nuestros usuarios. Esta Política de Privacidad explica cómo recopilamos, usamos, almacenamos y protegemos la información personal de quienes utilizan nuestra plataforma de gestión y administración de condominios.

Esta versión incorpora las medidas de seguridad implementadas durante 2026: segundo factor de autenticación (TOTP y código por correo), rotación de tokens de sesión, protección CSRF, verificación de interacción humana y registro de auditoría de accesos.


## 1. Información que recopilamos

### 1.1 Información personal del usuario

* Nombre completo y documento de identidad
* Correo electrónico y número telefónico
* Dirección del inmueble o unidad habitacional
* Rol dentro del condominio (condomino, administrador, superusuario)
* Información de acceso y autenticación (contraseña encriptada, tokens JWT)
* Datos de perfil y preferencias de usuario

### 1.2 Información financiera

* Historial de pagos de mantenimiento y cuotas condominales
* Métodos de pago utilizados (sin almacenar números completos de tarjetas de crédito)
* Estado de cuenta, adeudos y detalles de recibos
* Información de gastos, presupuestos y reportes financieros del condominio

### 1.3 Información de actividad dentro de la plataforma

* Avisos y notificaciones enviadas y recibidas
* Participación en votaciones y decisiones del condominio
* Cambios de solicitudes de mantenimiento o reparaciones
* Evidencias de pago y fotos de mantenimiento subidas por usuarios
* Historial de reportes financieros y de mantenimiento consultados

### 1.4 Información técnica

* Dirección IP y datos de conexión
* Tipo de dispositivo, navegador y sistema operativo
* Timestamps de acceso y actividad
* Datos de uso y navegación dentro de la plataforma
* Información de WebSockets para notificaciones en tiempo real

### 1.5 Información del condominio

* Datos estructurales del condominio (número de unidades, direcciones)
* Configuración de notificaciones y preferencias administrativas

### 1.6 Información de autenticación y segundo factor

* Contraseña almacenada **únicamente** como hash bcrypt (nunca en texto claro)
* Historial de intentos de inicio de sesión: correo, dirección IP, resultado y motivo del fallo
* Sesiones activas: identificador de familia del token, fecha de creación, expiración, dirección IP y agente de usuario
* Estado del segundo factor: método elegido (aplicación autenticadora o correo), fecha de activación y **secreto TOTP cifrado** con AES-256-GCM
* Códigos de recuperación de MFA almacenados como hash (nunca en claro) y su estado de uso
* Preferencia "mantener sesión iniciada" del dispositivo

**Importante:** Elyx no recibe ni almacena los códigos que genera su aplicación autenticadora. Solo verifica que el código introducido sea válido en ese instante.

### 1.7 Información de verificación de interacción humana

* Tipo de evento registrado (movimiento del cursor, pulsación de tecla, clic, desplazamiento, cambio de visibilidad de la pestaña)
* Marcas de tiempo e intervalos entre eventos
* Coordenadas relativas del cursor y tiempo de permanencia en el formulario
* Indicador técnico de automatización del navegador
* Puntaje de riesgo calculado y veredicto resultante

**No se registran los valores escritos en los campos**, ni contraseñas, ni el contenido de los mensajes. El detalle está en la sección 8.1 de este documento.

### 1.8 Información sobre verificación de seguridad de terceros

Cuando la protección Cloudflare Turnstile está activa, el navegador del usuario interactúa directamente con Cloudflare, que recibe la dirección IP, el agente de usuario y las señales técnicas necesarias para emitir el token de verificación. Elyx recibe únicamente el resultado (válido o no válido).

## 2. Cómo recopilamos la información

* **Directamente del usuario:** al registrarse, completar su perfil, realizar pagos, participar en votaciones, activar el segundo factor o cargar documentos
* **Automáticamente:** a través de cookies, tokens de sesión, registros de auditoría del servidor y telemetría de interacción
* **De terceros:** de proveedores de servicios de pago y de Cloudflare (verificación de seguridad), si están habilitados

La información de auditoría (intentos de acceso, sesiones y telemetría) se genera de forma automática y no requiere ninguna acción adicional del usuario.

## 3. Uso de la información

La información recopilada se utiliza para:

* **Gestión financiera:** procesar pagos, generar recibos y estados de cuenta
* **Administración del condominio:** facilitar la gestión de cuotas, gastos, reportes financieros y de mantenimiento
* **Comunicaciones:** enviar avisos, notificaciones de pagos, adeudos y cambios administrativos
* **Votaciones y decisiones:** permitir la participación en votaciones y procesos democráticos del condominio
* **Mantenimiento y soporte:** gestionar solicitudes de reparaciones y evidencias de mantenimiento
* **Seguridad:** proteger la integridad de la plataforma, prevenir fraudes y detener abuso
* **Mejora del servicio:** analizar el uso para mejorar la experiencia del usuario
* **Cumplimiento legal:** satisfacer obligaciones legales y regulatorias
* **Protección de la cuenta:** detectar accesos no autorizados, bloquear intentos repetidos fallidos y exigir un segundo factor cuando el usuario lo activa
* **Prevención de abuso:** distinguir personas de automatizaciones mediante la verificación de interacción descrita en la sección 8.1

## 4. Compartición de la información

Elyx **no vende información personal**. Sin embargo, podemos compartir datos en los siguientes casos:

* **Con administradores del condominio:** para la correcta gestión y administración del mismo
* **Con condominos:** información de pagos, adeudos y avisos que les correspondan
* **Con proveedores de servicios:** pasarelas de pago, servicios de hosting, envío de correo transaccional y verificación de seguridad (todos con contratos de confidencialidad)
* **Por requerimiento legal:** cuando sea requerido por autoridades judiciales o conforme a la ley
* **Protección de derechos:** para proteger los derechos y seguridad de Elyx, sus usuarios y la plataforma

### 4.1 Proveedores que pueden intervenir

| Proveedor | Cuándo interviene | Qué recibe |
|---|---|---|
| Cloudflare Turnstile | Si la verificación está activa, en el inicio de sesión y la recuperación de contraseña | Dirección IP, agente de usuario y señales técnicas del navegador |
| Proveedor de correo (SMTP o Resend) | Al enviar recuperación de contraseña, códigos de segundo factor o notificaciones por correo | Dirección de correo del destinatario y contenido del mensaje |
| Proveedor de infraestructura | Siempre | Datos alojados en la base de datos y archivos subidos, cifrados en tránsito |

**Ningún proveedor recibe contraseñas, tokens de sesión, secretos de segundo factor ni códigos de recuperación.**

### 4.2 Transferencias entre usuarios del mismo condominio

El administrador de un condominio puede ver los pagos, comprobantes y reportes de su condominio. El condómino solo ve su propia información. Un superusuario puede acceder a los condominios que administra la plataforma. Este acceso es parte del servicio y no requiere consentimiento adicional una vez que el usuario forma parte de un condominio.

## 5. Protección de la información

Implementamos medidas de seguridad técnicas, administrativas y físicas, incluyendo:

* Encriptación de datos en tránsito (HTTPS) y en reposo
* Autenticación basada en JWT con acceso controlado por roles
* Accesos restringidos basados en permisos (guardias de autenticación y autorización)
* Monitoreo continuo de actividad y auditoría de accesos
* Controles de validación y sanitización de entrada de datos
* Infraestructura segura con containerización (Docker) y prácticas de CI/CD
* Actualizaciones regulares de seguridad y parches

### 5.1 Medidas concretas implementadas

| Medida | Cómo protege al usuario |
|---|---|
| **Token de acceso de vida corta** | La credencial que viaja en cada petición caduca en 15 minutos; si se intercepta, su ventana de uso es mínima |
| **Token de sesión rotatorio** | El token persistente se guarda en una cookie `HttpOnly` inaccesible para JavaScript. Cada uso lo reemplaza, y si alguien intenta reutilizar uno ya rotado, **se cierran todas las sesiones de esa cadena** |
| **Protección CSRF** | Las operaciones que modifican datos exigen un token adicional de doble envío; un sitio externo no puede obtenerlo |
| **Segundo factor (MFA)** | Opcional y activable por el usuario. Con él, una contraseña filtrada no basta para entrar |
| **Secreto TOTP cifrado** | El secreto del autenticador se guarda cifrado con AES-256-GCM, no en claro |
| **Códigos de recuperación con hash** | Los códigos de respaldo de MFA se almacenan hasheados y se marcan como usados al consumirse |
| **Bloqueo progresivo** | Tras varios intentos fallidos, la cuenta se bloquea de forma escalonada (5, 15, 30 y 60 minutos), lo que frena ataques de fuerza bruta |
| **Límite de peticiones** | Se limita la frecuencia de peticiones por origen para evitar abuso automatizado |
| **Contraseñas con hash bcrypt** | Elyx no puede recuperar la contraseña del usuario; solo verificar si coincide |
| **Segundo reto de verificación** | Tras varios fallos se exige una operación adicional, que también frena la automatización |
| **Aislamiento por condominio** | Cada petición se contrasta contra las membresías del usuario; un condómino no puede consultar otro condominio |
| **Auditoría permanente** | Los intentos de acceso (exitosos y fallidos) quedan registrados con fecha e IP |

A pesar de estas medidas, ningún sistema es completamente seguro. No podemos garantizar seguridad absoluta y el usuario reconoce asumir cierto riesgo al usar la plataforma.

## 6. Derechos del usuario

Conforme a legislaciones de protección de datos, los usuarios tienen derecho a:

* **Acceso:** solicitar acceso a sus datos personales
* **Rectificación:** solicitar la corrección de información incorrecta o incompleta
* **Eliminación:** solicitar la eliminación de sus datos (sujeto a obligaciones legales de retención)
* **Portabilidad:** recibir sus datos en formato estructurado
* **Oposición:** oponerse al procesamiento de sus datos para ciertos fines
* **Limitación:** solicitar limitar el procesamiento de sus datos

Para ejercer estos derechos, contacte a:

**Correo de contacto:** [emiliano.aristarod@gmail.com](mailto:emiliano.aristarod@gmail.com)  
**Responsable de Privacidad:** Emiliano Arista Rodríguez

## 7. Retención de datos

* **Datos de usuarios activos:** Se conservan mientras la cuenta esté activa
* **Datos de usuarios inactivos:** Se retienen según obligaciones legales y regulatorias (mínimo 7 años para registros financieros)
* **Datos técnicos y logs:** Se retienen entre 90-365 días, según se requiera
* **Evidencias de pago y documentos:** Se conservan conforme a regulaciones fiscales y del condominio

### 7.1 Plazos por tipo de dato

| Dato | Plazo de conservación |
|---|---|
| Cuotas, pagos, recibos y reportes financieros | Mínimo 7 años (obligaciones fiscales) |
| Comprobantes y evidencias de pago | Mientras el pago exista; 7 años tras su validación |
| Intentos de inicio de sesión (auditoría) | Hasta 12 meses |
| Sesiones (tokens rotados y revocados) | Hasta 30 días después de su expiración |
| Telemetría de interacción humana | Máximo 30 días |
| Códigos de recuperación de MFA | Mientras el segundo factor esté activo; se eliminan al desactivarlo |
| Bloqueos temporales por intentos fallidos | 24 horas |
| Preferencia "mantener sesión iniciada" | Hasta 30 días o hasta que el usuario la elimine |

Los usuarios pueden solicitar la eliminación de datos cuando dejen de ser necesarios para los fines declarados, salvo aquellos que la ley obligue a conservar.

## 8. Uso de cookies y tecnologías similares

Elyx utiliza cookies y tecnologías similares para:

* **Autenticación:** mantener sesiones seguras
* **Preferencias:** recordar la elección de "mantener sesión iniciada" y configuraciones del usuario
* **Seguridad:** proteger las operaciones que modifican datos

**Tipos de cookies utilizadas:**

* **Esenciales:** necesarias para el funcionamiento de la aplicación

**Elyx no utiliza cookies publicitarias, de perfilado ni de análisis de terceros.**

El usuario puede configurar su navegador para rechazar cookies, aunque esto puede afectar la funcionalidad de la aplicación (especialmente la sesión y los avisos en tiempo real).

**Cookies de seguridad utilizadas:**

| Cookie | Finalidad | Duración | Accesible por JavaScript |
|---|---|---|---|
| `elyx_rt` | Token de sesión rotatorio. Viaja solo a las rutas de autenticación | 7 días si el usuario marca "mantener sesión iniciada"; en caso contrario, solo hasta cerrar el navegador (máximo 12 horas) | **No** (`HttpOnly`) |
| `elyx_csrf` | Token de doble envío para proteger las operaciones que modifican datos. No contiene información del usuario y se renueva en cada inicio de sesión | 2 horas | Sí (debe poder leerse para enviarla en la cabecera) |
| `elyx_recordar` | Recuerda si el usuario marcó "mantener sesión iniciada" en este dispositivo, para que el formulario muestre su elección | 30 días, o se elimina al pulsar "no recordar este dispositivo" | Sí (solo contiene `1` o `0`) |

Ninguna de estas cookies contiene información financiera, datos de salud ni datos sensibles.

**Preferencia "mantener sesión iniciada":** el usuario decide en cada dispositivo. Si no la marca, la sesión termina al cerrar el navegador. Puede revocar la preferencia en cualquier momento desde el inicio de sesión pulsando "no recordar este dispositivo", o cerrando sesión, lo que revoca el token en el servidor.

### 8.1 Verificación de interacción humana

Para distinguir personas de automatizaciones, Elyx mide señales de interacción en el navegador:

* Tipo de evento (movimiento de ratón, pulsación de tecla, clic, desplazamiento)
* Marcas de tiempo e intervalos entre eventos
* Coordenadas relativas del cursor y tiempo total en el formulario
* Indicador técnico `navigator.webdriver`

**No se registran los valores escritos en los campos**, ni contraseñas, ni el contenido de los mensajes. Los datos se usan para calcular un puntaje de riesgo, se conservan un máximo de 30 días y no se comparten con terceros. El resultado se utiliza para reforzar la verificación (por ejemplo, exigir un segundo CAPTCHA tras varios intentos fallidos), nunca para tomar decisiones comerciales sobre el usuario.

Esta medición es independiente del contenido de la cuenta: un puntaje bajo no bloquea el acceso por sí solo, ni afecta el estado de cuenta, las cuotas o los pagos del usuario.

## 9. Privacidad por rol de usuario

### Condominos
* Acceso limitado a su información financiera personal
* Visualización de avisos que les apliquen
* Participación en votaciones

### Administradores
* Acceso a información agregada del condominio
* Capacidad de gestionar usuarios y configuraciones
* Acceso a reportes financieros y de mantenimiento

### Superusuarios
* Acceso amplio para gestión de múltiples condominios
* Gestión de administradores
* Auditoría de la plataforma

## 10. Cambios a esta política

Nos reservamos el derecho de modificar esta Política de Privacidad en cualquier momento. Cambios significativos serán notificados:

* A través de la aplicación
* Por correo electrónico
* Mediante un aviso destacado al acceder a la plataforma

El uso continuo de Elyx después de cambios implica la aceptación de la política actualizada.

## 11. Responsabilidad internacional

Si utiliza Elyx desde fuera de México, tenga en cuenta que la información será transferida, almacenada y procesada en México. Al usar Elyx, consiente esta transferencia.

## 12. Contacto y reclamos

Si tiene preguntas o reclamos sobre esta Política de Privacidad o nuestras prácticas de privacidad:

* **Correo electrónico:** [emiliano.aristarod@gmail.com](mailto:emiliano.aristarod@gmail.com)
* **Responsable:** Emiliano Arista Rodríguez

También puede presentar una reclamación ante la autoridad de protección de datos competente en su jurisdicción.

## 13. Datos de contacto adicionales

* **Soporte técnico:** [emiliano.aristarod@gmail.com](mailto:emiliano.aristarod@gmail.com)
* **Reporte de seguridad:** [emiliano.aristarod@gmail.com](mailto:emiliano.aristarod@gmail.com)

---

## 14. Registro de cambios

### Versión de octubre 2026

* Se añade el **segundo factor de autenticación** (aplicación autenticadora o código por correo) y la sección sobre el tratamiento del secreto TOTP cifrado, los códigos de recuperación y el estado de MFA.
* Se documenta la **rotación del token de sesión** y la revocación automática de la cadena cuando se detecta reuso.
* Se añade la cookie `elyx_recordar` y la explicación de la preferencia **"mantener sesión iniciada"**, con la diferencia entre sesión persistente y sesión que termina al cerrar el navegador.
* Se amplía la sección de **cookies** con una tabla de finalidad, duración y accesibilidad de cada una.
* Se incorpora la sección **1.7** de verificación de interacción humana y la **1.8** sobre la verificación de seguridad de terceros.
* Se detalla la **auditoría de accesos** (intentos exitosos y fallidos con fecha e IP) y el bloqueo progresivo por intentos fallidos.
* Se añade la tabla de **proveedores que pueden intervenir** y se aclara qué datos recibe cada uno.
* Se incorpora la tabla de **plazos de conservación** por tipo de dato.
* Se amplía la sección de **protección** con las medidas concretas implementadas y cómo protegen al usuario.

### Versión de mayo 2026

* Versión inicial del documento con la estructura de recopilación, uso, compartición, derechos y retención.

---

**Al utilizar Elyx, el usuario acepta plenamente los términos de esta Política de Privacidad.**

---