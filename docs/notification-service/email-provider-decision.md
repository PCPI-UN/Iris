# Decisión: proveedor de correo del notification-service

| Campo | Valor |
| --- | --- |
| Requerimiento | IRIS-V3-INT-01 (Ref. plan S1-11) |
| Tarjeta | [CU-86e3vmxat](https://app.clickup.com/t/86e3vmxat) |
| Estado | **Decidido — mantener EmailJS como proveedor principal** |
| Fecha límite de aprobación | 3 nov 2026 |
| Aprobado por | Profesora Giselle (2 nov 2026) |

## 1. Contexto

`notification-service` envía todos los correos de Iris. Hoy lo hace una sola clase,
`AzureAdapter` (`apps/notification-service/src/infrastructure/email/azure.adapter.ts`), que:

1. Renderiza la plantilla HTML con Handlebars (asunto en el front-matter).
2. Envía con **EmailJS** como proveedor principal, usando una única plantilla de EmailJS que
   recibe `to_email`, `subject` y `message_html`.
3. Si EmailJS falla, reintenta con **Azure Communication Services (ACS) Email** como respaldo,
   solo si `ACS_CONNECTION_STRING` y `ACS_SENDER_ADDRESS` están configurados.

El plan gratuito de EmailJS (200 envíos/mes) es bajo para una feria. La decisión es
**mantener, optimizar o reemplazar** este esquema, considerando la licencia corporativa de
EmailJS que se solicitará a la profesora Giselle.

## 2. Inventario de correos

Cada fila es un envío a EmailJS (un destinatario por envío, por lo que **1 correo = 1 request del cupo**).

| Plantilla | Servicio / caso de uso | Disparador | Destinatarios por evento |
| --- | --- | --- | --- |
| `PROJECT_SUBMITTED` / `PARTICIPANTS_SUBMITTED` | project-service `createProjectWithPendingParticipants` → invitation-service `CreateInvitation` (target `PROJECT`) | Se registra un proyecto | 1 por participante (`N`) |
| `PROJECT_APPROVED` / `PARTICIPANTS_APPROVED` | project-service `ApproveProjectUC` | Se aprueba un proyecto | 1 por participante pendiente (`N`) |
| `PROJECT_REJECTED` / `PARTICIPANTS_REJECTED` | project-service `RejectProjectUC` | Se rechaza un proyecto | `N` |
| `REQUEST_CHANGES` | project-service `RequestChangesProjectUC` | Se piden cambios | `N` por ronda |
| `JUROR_INVITATION` | invitation-service `CreateInvitation` (target `EVENT`) | Se invita un jurado | 1 por jurado |
| `PLATFORM_INVITATION` | invitation-service `CreateInvitation` (target `PLATFORM`) | Se invita a la plataforma | 1 por invitado |
| `SIGNUP_CONFIRMATION` | auth-service `SignupUseCase` | Registro propio | 1 por registro |
| `PASSWORD_RESET` | auth-service `ForgotPasswordUseCase` | "Olvidé mi contraseña" | 1 por solicitud |
| `PASSWORD_CHANGED` | auth-service `ChangePasswordUseCase` | Cambio de contraseña | 1 por cambio |
| `PROJECT_SUBMITTED` | project-service `NotificateStudentUC` (RPC) | Llamada explícita | 1 |

Las variantes `PARTICIPANTS_*` se usan cuando el evento es de tipo `Competition`.

**Importante:** cuando el participante es un usuario nuevo (`status = PENDING`), el correo de
invitación al proyecto es el que contiene el enlace para crear su contraseña. Si ese correo no
llega, el estudiante no puede entrar a la plataforma.

## 3. Modelo de volumen

Variables (a completar con datos de la feria):

| Variable | Significado | Valor |
| --- | --- | --- |
| `P` | Proyectos registrados | _pendiente_ |
| `N` | Participantes promedio por proyecto | _pendiente_ |
| `r` | Rondas promedio de "solicitar cambios" por proyecto | _pendiente_ |
| `J` | Jurados invitados | _pendiente_ |
| `A` | Invitaciones a la plataforma | _pendiente_ |
| `S + R + C` | Registros + resets + cambios de contraseña | _pendiente_ |

Fórmula mensual:

```txt
correos ≈ P · N · (2 + r) + J + A + S + R + C
```

`2` = un correo al registrar el proyecto + uno al aprobar o rechazar.

**Ejemplo ilustrativo (no son datos reales):** `P = 100`, `N = 3`, `r = 0,5`, `J = 30`,
`A = 20`, `S + R + C = 100` → `100 · 3 · 2,5 + 30 + 20 + 100 = 900` correos/mes.
Eso es 4,5 veces el cupo gratuito de EmailJS.

**Pico por minuto:** los envíos se hacen en el mismo request del usuario, uno tras otro. Un
proyecto de `N` participantes dispara `N` envíos seguidos. Si varios grupos registran su
proyecto a la vez (por ejemplo, el día de cierre de inscripciones) se supera fácilmente el
límite de EmailJS de **1 request por segundo**.

## 4. Datos de los proveedores

Consultado el 2 nov 2026 en las páginas oficiales.

### EmailJS ([precios](https://www.emailjs.com/pricing/), [API /send](https://www.emailjs.com/docs/rest-api/send/))

| Plan | Precio | Envíos/mes | Notas |
| --- | --- | --- | --- |
| Free | $0 | 200 | 2 plantillas, requests de hasta 50 KB, historial 7 días |
| Personal | $9/mes | 2.000 | 6 plantillas, historial 30 días |
| Professional | $15/mes (desde) | 5.000 o 10.000 | Plantillas ilimitadas, lista de supresión, 3 usuarios |
| Business | $40/mes (desde) | 25.000 a 200.000 | Usuarios ilimitados |

- Límite de la API: **1 request por segundo**.
- Al llegar al 100 % del cupo, EmailJS **descarta** los envíos siguientes (sin cobro extra) y
  avisa por correo al dueño de la cuenta al 80 %, 95 % y 100 %.
- El plan anual tiene 20 % de descuento.
- EmailJS envía a través del servicio de correo conectado en su panel (por ejemplo, una cuenta de
  Gmail u Outlook), así que también aplican los límites de ese servicio.
- Nuestras plantillas pesan entre 3,5 y 4,3 KB, lejos del límite de 50 KB del plan gratuito.

### Azure Communication Services Email ([límites](https://learn.microsoft.com/en-us/azure/communication-services/concepts/service-limits#email), [precios](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email-pricing), [retiro](https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide))

| Tipo de dominio | Límite por minuto | Límite por hora | ¿Se puede ampliar? |
| --- | --- | --- | --- |
| Dominio administrado por Azure | 5 | 10 | No |
| Dominio propio verificado | 30 | 100 | Sí, por solicitud de soporte (requiere tasa de fallo < 1 %) |

- Precio: USD 0,00025 por correo + USD 0,00012 por MB (≈ USD 0,25 por cada 1.000 correos).
- Los límites son **por suscripción**, no por dirección remitente.
- ⚠️ **Microsoft anunció el 23 sep 2026 el retiro de ACS como producto independiente; ACS Email
  deja de existir el 30 sep 2028.** Desde el 23 oct 2026 Microsoft empezó a limitar la
  incorporación de clientes nuevos y recomienda migrar en lugar de iniciar soluciones nuevas
  sobre ACS Email. Los recursos creados antes del 23 oct 2026 siguen funcionando durante la
  transición.

## 5. Problemas encontrados en la implementación actual

1. **El servicio no arranca sin EmailJS.** `onModuleInit` lanza un error si falta cualquier
   variable `EMAILJS_*`. No existe un modo "solo Azure", aunque Azure esté configurado.
2. **Ambos proveedores en una sola clase.** `AzureAdapter` contiene EmailJS y ACS. No se puede
   cambiar el proveedor por configuración.
3. **Sin reintento ante el límite de 1 req/s.** Un `429` de EmailJS pasa directo al respaldo de
   Azure, que tiene un límite aún más bajo si usa dominio administrado (10 por hora).
4. **El respaldo de Azure no confirma la entrega.** Se llama `beginSend` sin `pollUntilDone`,
   así que un fallo posterior a la aceptación no se detecta. El `plainText` es un texto fijo de
   relleno.
5. **Los fallos se ocultan.** auth-service, invitation-service y project-service capturan el
   error y siguen. Si se agota el cupo, los correos se pierden sin aviso y el usuario no sabe que
   tiene que pedir un reenvío.
6. **Configuración inconsistente:**
   - `.env.example` documenta solo `ACS_*`, no `EMAILJS_*`.
   - `k8s/config/configmap.yaml` usa nombres que el código no lee (`EMAIL_PUBLIC_KEY`,
     `EMAIL_PRIVATE_KEY`, `EMAILJS_TEMPLATE_PROJECT-CONFIRMATION_ID`) y no define
     `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID` ni `ACS_*`.
7. ⚠️ **Credenciales expuestas.** `k8s/config/configmap.yaml` tiene la llave pública y la
   **privada** de EmailJS en texto plano dentro del repositorio. Deben rotarse y moverse a un
   `Secret`, independientemente de la decisión.
8. **Plantilla incompleta.** `iris_platform_invitation.html` es solo una línea de texto
   ("…con los roles de...") sin HTML ni enlace.

## 6. Opciones

| | A. Mantener tal cual | B. EmailJS con licencia + optimizar | C. Azure ACS como principal | D. Reemplazar por otro proveedor |
| --- | --- | --- | --- | --- |
| Cupo | 200/mes | 2.000–10.000/mes según plan | 100/hora con dominio propio (ampliable) | Depende del proveedor |
| Costo | $0 | $9–$15/mes | ≈ $0,25 por 1.000 | Depende |
| Cambios de código | Ninguno | Bajos (ver §7) | Medios | Altos (adaptador nuevo) |
| Riesgo principal | Se agota el cupo en la feria | Depende de que llegue la licencia | Producto en retiro; requiere dominio propio verificado | Tiempo de integración y verificación de dominio |
| Viable antes de la feria | No | Sí | Solo si ya existe el recurso y el dominio | Poco probable |

## 7. Recomendación preliminar

**Opción B: mantener EmailJS como proveedor principal con la licencia corporativa, y optimizar.**

Regla de decisión, una vez se tenga el volumen de la §3:

- Si `correos/mes ≤ 1.800` → plan **Personal** (2.000), con 10 % de margen.
- Si `1.800 < correos/mes ≤ 4.500` → plan **Professional 5.000**.
- Si es mayor → **Professional 10.000** o **Business**.
- Si la licencia **no** llega antes de la feria → mantener el plan gratuito solo para pruebas y
  evaluar la opción C con un dominio propio verificado, si el recurso de ACS existe desde antes
  del 23 oct 2026.

Azure ACS se mantiene solo como respaldo mientras exista el recurso. No se recomienda invertir
más en ACS por su retiro en 2028; el reemplazo del respaldo queda como trabajo futuro (opción D).

Optimizaciones propuestas (tarjetas de seguimiento):

1. Rotar las llaves de EmailJS expuestas y moverlas a un `Secret` de Kubernetes.
2. Alinear las variables de entorno entre `.env.example`, `docker-compose*.yml` y `k8s/`.
3. Separar `AzureAdapter` en `EmailJsAdapter` y `AcsAdapter`, con proveedor principal y respaldo
   elegidos por configuración, y permitir arrancar con uno solo.
4. Limitar la tasa de envío a 1 req/s y reintentar con espera los `429` antes de pasar al respaldo.
5. En ACS, esperar el resultado de `beginSend` (`pollUntilDone`) y enviar un `plainText` real.
6. Dar visibilidad a los fallos: métrica o log de envíos por proveedor, y que el equipo reciba los
   avisos de cupo de EmailJS (80/95/100 %).
7. Completar la plantilla `iris_platform_invitation.html`.

## 8. Datos pendientes

- [ ] Volumen esperado de la feria (variables de la §3) y fechas pico.
- [x] Licencia de EmailJS: la profesora Giselle la ampliará.
- [ ] Plan y fecha de activación de la licencia ampliada.
- [ ] Servicio de correo conectado en EmailJS (Gmail, Outlook, institucional) y sus límites.
- [ ] Consumo real de EmailJS en el último mes y en ferias anteriores.
- [ ] Si el recurso de ACS en producción existe, desde cuándo, y si usa dominio propio o
      administrado por Azure.
- [ ] Si los manifiestos de `k8s/` son los que se despliegan.
- [ ] Por qué se volvió a EmailJS después de migrar a ACS (commits `91c76dc` → `0baf6a1`).

## 9. Decisión

**Se mantiene EmailJS como proveedor principal de correo** (opción B de la §6).

- Azure ACS sigue como respaldo, sin cambios, mientras exista el recurso. No se invierte más en
  él por su retiro el 30 sep 2028.
- La profesora Giselle ampliará la licencia de EmailJS. El plan (Personal, Professional o
  Business) se elige con la regla de la §7 según el volumen esperado de la feria.
- Las optimizaciones de la §7 quedan como tarjetas de seguimiento.
