# Event Service

## Purpose

This service manages the core data of events, including categories, awards, staff members, inscription details, and event recaps published after the event ends.

The database is modeled with Prisma on top of PostgreSQL. Physical tables and columns use `snake_case` through `@map` and `@@map`, while the application layer exposes fields in `camelCase`.

## Base Configuration

### Generator

- `client`: generates the Prisma client using `prisma-client-js`.

### Datasource

- `db`: uses PostgreSQL and reads the connection string from the `DATABASE_URL` environment variable.

## Entity Relationship Diagram

Columns follow the field order of `apps/event-service/prisma/schema.prisma`. `PK`, `FK` and `UK` mark primary, foreign and unique keys; optional columns carry the `nullable` comment. Names are the Prisma field names (see each model below for the physical `snake_case` column).

```mermaid
erDiagram
    Event ||--o{ StaffEventMember : "participants"
    Event ||--o{ Category : "categories"
    Event ||--o{ EventInscriptionDetail : "eventInscriptionDetails"
    Event ||--o{ EventRecap : "eventRecaps"
    Event ||--o| RankingEvent : "rankingEvent"
    Category ||--o{ AwardCategoryEvent : "categoryAwards"
    AwardCategoryEvent ||--o{ AwardWinnerEvent : "awardWinnerEvents"

    Event {
        Int id PK
        String name
        String description
        String accessCode UK
        Boolean isPubliclyJoinable
        DateTime inscriptionDeadline
        Float inscriptionCost "nullable"
        Boolean evaluationsOpened
        DateTime startDate
        DateTime endDate
        Boolean active
        Int createdByUserId
        String location
        String locationDetails "nullable"
        EvaluationType evaluationType "nullable"
        String inscriptionRequirements "nullable"
        Int minimumTeamSize "nullable"
        String aboutOurAllies "nullable"
        eventType eventType
        String[] collaborators
        String[] organizers
        Float latitude "nullable"
        Float longitude "nullable"
        DateTime createdAt
        DateTime updatedAt
    }

    EventInscriptionDetail {
        Int id PK
        Int eventId FK
        String title
        String description "nullable"
        Int value "nullable"
        Boolean isRequired
        DateTime createdAt
        DateTime updatedAt
    }

    EventRecap {
        Int id PK
        Int eventId FK
        String headline
        String summary "nullable"
        String closingMessage "nullable"
        String galeryUrl "nullable"
        Boolean published
        DateTime createdAt
        DateTime updatedAt
    }

    StaffEventMember {
        Int userId PK
        Int eventId PK, FK
        Int roleId
        Boolean active
        DateTime createdAt
        DateTime updatedAt
    }

    Category {
        Int id PK
        Int eventId FK
        String name
        String description "nullable"
        Boolean active
        DateTime createdAt
        DateTime updatedAt
    }

    AwardCategoryEvent {
        Int id PK
        Int categoryId FK
        String title
        String description "nullable"
        Float value "nullable"
        Int position
        DateTime createdAt
        DateTime updatedAt
    }

    AwardWinnerEvent {
        Int id PK
        Int awardId FK
        Int projectId
        Float grade
        DateTime createdAt
        Int assignedByUserId
    }

    RankingEvent {
        Int id PK
        Int eventId FK, UK
        Boolean visiblePublic
        Int positions
        Boolean gradeVisible
        DateTime createdAt
        DateTime updatedAt
    }
```

### Columns without a foreign key

These columns reference data owned by other services, or by this service by convention only, so the database enforces no constraint on them.

| Column | References |
| --- | --- |
| `Event.createdByUserId` | `auth-service.users.id` |
| `StaffEventMember.userId` | `auth-service.users.id` |
| `StaffEventMember.roleId` | `auth-service.roles.id` |
| `AwardWinnerEvent.projectId` | `project-service.projects.id` |
| `AwardWinnerEvent.assignedByUserId` | `auth-service.users.id` |

`StaffEventMember` has a composite primary key (`userId` + `eventId`); `eventId` is also the foreign key to `Event`. `RankingEvent.eventId` is both a foreign key and unique, which makes the relation with `Event` one-to-one.

## Enum

### `eventType`

Defines the allowed event types in the system.

- `Expo`: exhibition-style event.
- `Competencia`: competition-style event.

### `EvaluationType`

Defines the evaluation scale configured for an event and shared through `libs/common/src/protos/event.proto`.

- `FINAL_PROJECTS`: current final-project rubric. Evaluation service validates raw scores `1` through `4` and maps them to `25`, `55`, `75`, and `90`.
- `ZERO_TO_FIVE`: reserved for a future `0` through `5` evaluation scale.
- `ZERO_TO_HUNDRED`: reserved for a future `0` through `100` evaluation scale.

The event is the source of truth for `evaluationType`. Evaluation requests do not send this value; `evaluation-service` resolves it from `projectId -> project.eventId -> event.evaluationType`.

Current persistence note: existing events without a stored `evaluationType` are exposed through the service as `FINAL_PROJECTS` so existing final-project evaluations continue to work. Database migration for persisted `FINAL_PROJECTS` values is handled separately.

## Models

### `Event`

This is the main entity in the service. It represents an event created by a user and stores its operational configuration.

#### Main fields

- `id`: unique auto-incremented identifier.
- `name`: event name.
- `description`: general event description.
- `accessCode`: unique access code used for event linking or management.
- `isPubliclyJoinable`: indicates whether the event allows public inscription.
- `inscriptionDeadline`: deadline for inscription.
- `inscriptionCost`: inscription cost. Optional.
- `evaluationsOpened`: indicates whether evaluations are currently enabled.
- `startDate`: event start date.
- `endDate`: event end date.
- `active`: logical status of the event. Defaults to `true`.
- `createdByUserId`: identifier of the user who created the event.
- `location`: main event location.
- `locationDetails`: additional location details. Optional.
- `evaluationType`: evaluation mode configured for the event based on the shared `EvaluationType` enum. Optional in persistence during the transition period; service responses default missing values to `FINAL_PROJECTS`.
- `inscriptionRequirements`: additional inscription requirements or conditions for participants. Optional.
- `minimumTeamSize`: minimum number of members required per team. Optional.
- `aboutOurAllies`: descriptive information about the event allies or partners. Optional.
- `eventType`: event type based on the `eventType` enum.
- `collaborators`: array of collaborators associated with the event.
- `organizers`: array of organizers associated with the event.
- `createdAt`: record creation timestamp.
- `updatedAt`: record update timestamp.

#### Relationships

- One `Event` has many `StaffEventMember` records.
- One `Event` has many `Category` records.
- One `Event` has many `EventInscriptionDetail` records.
- One `Event` has many `EventRecap` records.

#### Physical table

- Stored in the `event` table.

### `EventInscriptionDetail`

Stores complementary information about the inscription process of an event, ordered for presentation or priority purposes.

#### Main fields

- `id`: unique auto-incremented identifier.
- `eventId`: reference to the event.
- `title`: detail title.
- `description`: descriptive content of the detail. Optional.
- `value`: optional cost of the detail. Defaults to `0`.
- `isRequired`: indicate whether this detail is mandatory. Defaults to `True`
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### Relationships

- Belongs to one `Event` through `eventId`.

#### Physical table

- Stored in `event_inscriptions_details`.

### `EventRecap`

Represents a recap or closing summary of an event, useful for publishing outcomes or post-event content.

#### Main fields

- `id`: unique auto-incremented identifier.
- `eventId`: reference to the event.
- `headline`: main recap title.
- `summary`: event summary. Optional.
- `closingMessage`: closing message. Optional.
- `galeryUrl`: associated gallery URL. Optional.
- `published`: indicates whether the recap has been published. Defaults to `false`.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### Relationships

- Belongs to one `Event` through `eventId`.

#### Physical table

- Stored in `event_recaps`.

### `StaffEventMember`

Represents the membership of a staff user within an event, including the assigned role.

#### Main fields

- `userId`: identifier of the staff user.
- `eventId`: identifier of the event.
- `roleId`: identifier of the assigned role.
- `active`: indicates whether the relationship is active.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### External references

- `userId`: references `auth-service.users`.
- `roleId`: references `auth-service.roles`.

#### Relationships

- Belongs to one `Event` through `eventId`.

#### Constraints

- The primary key is composite: `userId` + `eventId`. This prevents the same user from being registered more than once in the same event.

#### Physical table

- Stored in `event_members`.

### `Category`

Groups participants, projects, or evaluations inside an event. Each category belongs to a specific event.

#### Main fields

- `id`: unique auto-incremented identifier.
- `eventId`: reference to the event.
- `name`: category name.
- `description`: category description. Optional.
- `active`: logical status of the category. Defaults to `true`.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### Relationships

- Belongs to one `Event`.
- Has many `AwardCategoryEvent` records.

#### Physical table

- Stored in `categories`.

### `AwardCategoryEvent`

Defines the awards associated with a category inside an event.

#### Main fields

- `id`: unique auto-incremented identifier.
- `categoryId`: reference to the category.
- `title`: award name.
- `description`: award description. Optional.
- `value`: monetary or symbolic award value. Optional.
- `position`: rank or placement of the award, for example first place. Defaults to `0`.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### Relationships

- Belongs to one `Category`.
- Has many `AwardWinnerEvent` records.

#### Physical table

- Stored in `category_awards`.

### `AwardWinnerEvent`

Assigns a winning project to a specific award and stores the score associated with that assignment.

#### Main fields

- `id`: unique auto-incremented identifier.
- `awardId`: reference to the assigned award.
- `projectId`: identifier of the winning project.
- `grade`: score or grade used to grant the award.
- `createdAt`: assignment timestamp, physically mapped as `assigned_at`.
- `assignedByUserId`: identifier of the user who assigned the award.

#### External references

- `projectId`: references `project-service.projects`.

#### Relationships

- Belongs to one `AwardCategoryEvent`.

#### Physical table

- Stored in `award_winners`.

## General Relationships

The main schema relationships are:

- `Event` 1:N `EventInscriptionDetail`
- `Event` 1:N `EventRecap`
- `Event` 1:N `StaffEventMember`
- `Event` 1:N `Category`
- `Category` 1:N `AwardCategoryEvent`
- `AwardCategoryEvent` 1:N `AwardWinnerEvent`

## Design Notes

- The schema uses timezone-aware timestamps (`Timestamptz`) for relevant domain dates.
- Several entities rely on logical deletion through the `active` field instead of physical deletion.
- `collaborators` and `organizers` are stored as `String[]`, which simplifies the schema but limits normalization and relational querying.
- `Category.name` is marked as `@unique`, so the same category name cannot currently be reused across different events.
- `StaffEventMember` does not have a standalone `id`; its uniqueness depends on the `userId + eventId` composite key.
- `evaluationType` drives downstream score validation and mapping in `evaluation-service`; changing it changes accepted score ranges once the corresponding evaluation type is implemented.
