# Invitation Service

Owns invitations to the platform, to an event or to a project. It creates the invitation, sends the email through `notification-service`, and, when the invitation is accepted, orchestrates the account activation and the role or membership the invitation grants.

- **Transport**: gRPC (`InvitationService`). The contract is `libs/common/src/protos/invitation.proto`.
- **Database**: PostgreSQL database `invitation_service`, managed with Prisma. See [schema.md](./schema.md).
- **HTTP**: none. Public endpoints live in the gateway (`/invitations/*`); see Swagger at `/api/docs`.

## Boundaries

| Invitation service does | Invitation service does not |
| --- | --- |
| Store invitations, their target (platform, event or project), status, expiry and the roles to grant | Store users, roles or permissions: it asks `auth-service` |
| Create a pending user in `auth-service` when the invited email has no account | Decide whether a caller may invite: authorization is the gateway's responsibility |
| Send the invitation email through `notification-service` | Render or deliver emails itself |
| On acceptance, activate the account and grant the platform roles, the event membership or the project participation | Store event membership or project participants: those belong to `event-service` and `project-service` |
| Resend invitations and list them by event or by invited user | Expire invitations in the background: expiry is checked when the invitation is read |

## Modules

The service has a single module, `invitations`, following the layering described in `LLM_RULES.md` (`domain`, `application`, `infrastructure`, `interface`).

| Area | Responsibility |
| --- | --- |
| Creation | Create or reuse an invitation, create the pending user if needed, send the email |
| Lookup | Get an invitation by token; list invitations by event or by user |
| Acceptance | Activate the account and apply the target: platform roles, event membership or project participation |
| Resend and rejection | Resend pending or expired invitations; reject by token |

## Target types

| Target | `target_id` refers to | On acceptance |
| --- | --- | --- |
| `PLATFORM` | not used | `auth-service` assigns the invitation's platform roles |
| `EVENT` | an event in `event-service` | `event-service` adds the user as an event member with each role |
| `PROJECT` | a project in `project-service` | `project-service` adds the user as a confirmed participant, then `event-service` adds the event membership |

## Dependencies

- **Uses**: PostgreSQL, `auth-service` (users, account setup tokens, platform roles), `event-service` (events and membership), `project-service` (projects and participants) and `notification-service` (emails).
- **Used by**: `gateway` and `project-service` (one invitation per participant when a project is submitted).

## Main flow: invitation and acceptance

```mermaid
sequenceDiagram
    autonumber
    actor O as Organizer
    participant GW as Gateway
    participant I as Invitation service
    participant A as Auth service
    participant N as Notification service
    actor U as Invited user
    participant T as Event / Project service

    O->>GW: invite email to a target with roles
    GW->>I: CreateInvitation
    I->>A: find user by email, or create a pending user and an account setup token
    I->>I: store invitation (PENDING) and its roles
    I->>N: send invitation email with link

    U->>GW: open link, set password, accept
    GW->>I: AcceptInvitation (token)
    I->>A: activate account
    alt PLATFORM
        I->>A: assign platform roles
    else EVENT or PROJECT
        I->>T: add event membership / project participant
    end
    I->>I: mark invitation ACCEPTED
```

- The invitation token identifies the invitation. For a new user it is the same account setup token issued by `auth-service`, so one link both sets the password and accepts the invitation.
- Only one accepted invitation is allowed per email and target. Creating an invitation while a pending one exists returns the existing one.

## Related

- [schema.md](./schema.md): database schema and ER diagram.
- `libs/common/src/protos/invitation.proto`: gRPC contract.
- `apps/gateway/src/modules/invitations`: HTTP endpoints.
