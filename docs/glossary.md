# Glossary (Spanish terms)

Users read Iris in Spanish: API error messages, emails and the front end. This is the Spanish term
to use for each domain concept, so every message names things the same way. Code, logs and
these docs stay in English.

| Concept (code) | Spanish | Notes |
|---|---|---|
| event | evento | |
| course | categoría | Courses are the categories of an event (`courseIds`). |
| category (ranking, awards) | categoría | |
| award | premio | |
| project | proyecto | |
| participant | participante | |
| tutor | tutor | |
| juror | jurado | |
| juror import | importación de jurados | |
| evaluation | evaluación | |
| rubric | rúbrica | |
| component | componente | A group of criteria with a weight. |
| criterion | criterio | |
| weight | peso | |
| score | puntaje | |
| level | nivel | The 1–4 level a juror picks for a criterion. |
| grading scale | escala de calificación | |
| tiebreak | desempate | |
| ranking | ranking | |
| inscription / registration | inscripción | |
| invitation | invitación | |
| user | usuario | |
| account | cuenta | |
| role | rol | Platform role (`rol de plataforma`) or event role (`rol de evento`). |
| permission | permiso | |
| administrator | administrador | The principal administrator is `administrador principal`. |
| platform | plataforma | |
| session / refresh token | sesión | Errors about the refresh token talk about the session. |
| password reset / confirmation token | enlace | The user only sees the link that carries it. |
| document, logo, poster, supporting document | documento, logo, póster, documento de soporte | |
| email | correo | |

## Writing messages

- Say what happened and, when there is one, what to do: `No se pudo crear el criterio. Intenta de nuevo más tarde.`
- Not found: `No se encontró el <concepto> con ID <id>`.
- Field names in validation messages stay as the API names them (`eventId`, `limit`), since that is what the request sends.
- Codes and states keep their API value (`REQUEST_CHANGES`, `FINAL_PROJECTS`).
- class-validator's default messages are translated by `libs/common/src/i18n/validation-messages.ts`; a DTO that sets its own `message` writes it in Spanish.
- Messages Iris does not write (an unknown route, a service that is down, an unexpected failure) are turned into Spanish by the gateway's `GrpcExceptionFilter`.
