# Evaluation Service

## Purpose

This service manages project evaluations, detailed criterion scores, evaluation criteria, and the association between criteria and categories.

The database is modeled with Prisma on top of PostgreSQL. Physical tables and columns use `snake_case` through `@map` and `@@map`, while the application layer exposes fields in `camelCase`.

## Evaluation Type Flow

Evaluation score validation and score mapping are dynamic and depend on the event evaluation type.

The evaluation request does not receive `evaluationType` from the client or gateway. The use case resolves it internally with this flow:

1. Receive `projectId` in the evaluation request.
2. Query `project-service` for the project.
3. Read `project.eventId`.
4. Query `event-service` for the event.
5. Read `event.evaluationType`.
6. Select the score validator and score mapper for that evaluation type.

This avoids duplicating `evaluationType` in the evaluation request and keeps the event as the source of truth.

### Supported Evaluation Types

The shared proto enum currently exposes:

- `FINAL_PROJECTS`
- `ZERO_TO_FIVE`
- `ZERO_TO_HUNDRED`

Evaluators always submit one of four integer levels (`1`–`4`). The rubric labels them 5/4/3/2 (Excelente, Bueno, Aceptable, Insuficiente); that difference is only a label in the UI. Non-integer levels are rejected, not rounded.

The level is mapped before persistence and grade calculation. Each evaluation type uses its own scheme:

| Level | Rubric label | `FINAL_PROJECTS` (range midpoint) | `ZERO_TO_FIVE` (rubric value) | `ZERO_TO_HUNDRED` (range top) |
| --- | --- | --- | --- | --- |
| `1` | Insuficiente | `25` | `2` | `40` |
| `2` | Aceptable | `55` | `3` | `60` |
| `3` | Bueno | `75` | `4` | `80` |
| `4` | Excelente | `90` | `5` | `100` |

`ZERO_TO_FIVE` stored `1.5` for level `1` before it was aligned with the rubric. Historical evaluations keep that value and can still be read back.

### Components And Weights

An event has a single rubric shared by all its categories (courses):

- **Components** belong to one event and carry a weight, a fraction of the grade (e.g. Comunicación Escrita `0.3`, Descripción del Diseño `0.4`, Comunicación Oral `0.3`). The components of an event cannot exceed 100% when they are configured, and must add up to exactly 100% before the event can be evaluated.
- **Criteria** belong to one component of their event and to one or more categories. Their `weight` is **relative** to the other criteria of the same component in the same category (`1` by default) and is never rewritten by the service.
- The **effective weight** of a criterion in the grade is computed when evaluating and stored with each evaluation detail:

```txt
effectiveWeight = component.weight × criterion.weight ÷ Σ criterion.weight (same component, same category)
```

Example: Comunicación Oral `0.3` with relative weights `10 / 9 / 9` gives the first criterion `0.3 × 10 ÷ 28 = 0.1071`.

A category is **ready** to be evaluated when the event components add up to 100% and every component has at least one active criterion of that category. `GetRubricReadiness` (gateway `GET /criterions/readiness?eventId=&courseId=`) reports it for every category of the event (taken from event-service), also the ones without any criterion.

Once a rubric is used to grade, it is locked. Locked changes are rejected with `FAILED_PRECONDITION`; names and descriptions can always be edited, and historical grades are never recalculated.

- **Criteria** are locked per category: a change is rejected only when it alters the rubric of a category that already has evaluations. The category of an evaluation is the category of the evaluated project, asked to project-service (it cannot be deduced from the scored criteria, because a criterion can be shared by several categories). Changing the weight, component, state or event of a criterion alters every category it belongs to; adding or removing a category alters only that category. Example: with Civil evaluated and Ambiental not, a criterion can still be created for Ambiental, or a criterion shared by both can stop belonging to Ambiental, but nothing that changes Civil's rubric is accepted.
- An evaluated category is locked only **while its rubric is complete** (it is ready to be evaluated). A category that is not complete cannot be evaluated by anyone, so it can still be fixed, and it locks again once complete. Example: in an event left at `0.979` with Civil evaluated, a component "Ajuste" of `0.021` is created to reach 100%; Civil has no criterion in it, so its remaining jurors cannot evaluate, and the components can no longer change. Civil can still get its criterion in "Ajuste"; without this, the event would stay blocked.
- **Components** are shared by every category, so they are locked per event: once the event has evaluations, components cannot be created, deleted or change weight, **while they add up to 100%**. An evaluated event whose components do not add up to 100% (e.g. an event left at `0.979` by the rubric migration) can still fix them: no grade was computed with an incomplete rubric, and each evaluation keeps the effective weights it was graded with.
- Lowering a component weight is always allowed, so an event whose components exceed 100% can be fixed; only raising one above 100% is rejected.
- Moving a criterion to another event requires the categories (`courseIds`) of the new event.
- A component never changes its event, and a component with active criteria cannot be deleted (its inactive criteria are detached).

Rubric changes and evaluations of an event never interleave: both run in one transaction holding a Postgres advisory lock of the event (`pg_advisory_xact_lock(86301, eventId)`). Evaluations take it shared, so jurors do not wait for each other; rubric changes take it exclusive. The repositories query through `PrismaService.db`, which is the open transaction inside `PrismaService.transaction()`.

### Rubric And Grade Rules

The rubric of a project is the set of active criteria associated with the project's course in the project's event. When a juror submits an evaluation:

1. The rubric must be ready (see above). Otherwise the evaluation is rejected with `FAILED_PRECONDITION`, listing what is missing.
2. Every criterion of the rubric must be scored exactly once. Missing, repeated or foreign criteria are rejected with `INVALID_ARGUMENT`.
3. The grade is a weighted sum, stored rounded to 2 decimals, and each detail keeps the effective weight it was graded with:

```txt
grade = round2(sum(mappedScore × effectiveWeight))
```

The project grade is the plain average of its jurors' grades, rounded to 2 decimals. `getProjectStats` and `getTopProjectsByCourse` return it with the same half-up rule the gateway ranking uses (`roundGrade` in `libs/common/src/utils/grade-rounding.ts`), so the ranking positions, the co-winner detection and the Excel report compare and show the same value. The category weights in `getProjectStats` come from the effective weights stored with the evaluations.

Only score validation and score mapping depend on `evaluationType`.

### Score Validation And Mapping Architecture

The score behavior is split behind domain ports:

- `ScoreValidator`: validates a score for an evaluation type.
- `ScoreMapper`: maps a valid raw score into the stored score used by grade calculation.

The application layer selects concrete implementations through factories:

- `ScoreValidatorFactory.create(evaluationType)`
- `ScoreMapperFactory.create(evaluationType)`

Current concrete implementation:

- `FinalProjectsScoreValidator`
- `FinalProjectsScoreMapper`

This structure lets new evaluation scales be added without rewriting `EvaluateProjectUseCase`.

## Base Configuration

### Generator

- `client`: generates the Prisma client using `prisma-client-js`.

### Datasource

- `db`: uses PostgreSQL and reads the connection string from the `DATABASE_URL` environment variable.

## Models

### `Evaluation`

This is the main entity in the service. It represents an evaluation assigned by a staff member to a project.

#### Main fields

- `id`: unique auto-incremented identifier.
- `projectId`: identifier of the evaluated project.
- `memberUserId`: evaluator user identifier.
- `memberEventId`: event identifier associated with the evaluator membership.
- `memberRoleId`: evaluator role identifier within the event.
- `grade`: overall grade assigned to the project.
- `comments`: optional evaluator comments.
- `date`: date when the evaluation was recorded.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### External references

- `projectId`: references `project-service.projects`.
- `memberUserId`, `memberEventId`, and `memberRoleId`: together represent the evaluator identity using the composite structure of `event-service.StaffEventMember`.

#### Relationships

- One `Evaluation` has many `EvaluationDetail` records.

#### Physical table

- Stored in the `evaluations` table.

### `EvaluationDetail`

This model stores the score assigned to a specific criterion within an evaluation.

#### Main fields

- `evaluationId`: reference to the evaluation.
- `criterionId`: reference to the criterion.
- `score`: mapped score obtained for the criterion. For `FINAL_PROJECTS`, this is one of `25`, `55`, `75`, or `90`, not the raw evaluator input `1` through `4`.
- `weight`: effective weight the criterion had in the grade when it was evaluated (see Components And Weights). Rubric changes never alter it.

#### Relationships

- Belongs to one `Evaluation`.
- Belongs to one `Criterion`.

#### Constraints

- The primary key is composite: `evaluationId` + `criterionId`. This prevents duplicate scores for the same criterion within a single evaluation.

#### Physical table

- Stored in `evaluation_detail`.

### `Criterion`

Defines the criteria used to evaluate projects inside an event.

#### Main fields

- `id`: unique auto-incremented identifier.
- `eventId`: identifier of the event that owns the criterion.
- `name`: criterion name.
- `description`: optional criterion description.
- `weight`: relative weight of the criterion inside its component and category (`1` by default).
- `active`: indicates whether the criterion is currently active.
- `category`: optional grouping label for the criterion.
- `componentId`: component of the same event the criterion belongs to.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### External references

- `eventId`: references `event-service.event`.

#### Relationships

- One `Criterion` has many `EvaluationDetail` records.
- One `Criterion` has many `CriterionCategory` records.
- Belongs to one `Component`.

#### Physical table

- Stored in `criterions`.

### `Component`

Groups the criteria of an event and holds the share of the grade they split.

#### Main fields

- `id`: unique auto-incremented identifier.
- `name`: component name (e.g. Comunicación Oral).
- `weight`: fraction of the grade (`0`–`1`); the components of an event add up to `1`.
- `eventId`: identifier of the event that owns the component. Required and never changed.

#### Relationships

- One `Component` has many `Criterion` records.

#### Physical table

- Stored in `Component`.

### `CriterionCategory`

This junction model associates evaluation criteria with categories.

#### Main fields

- `criterionId`: reference to the criterion.
- `categoryId`: identifier of the associated category.

#### External references

- `categoryId`: references `event-service.categories`.

#### Relationships

- Belongs to one `Criterion`.

#### Constraints

- The primary key is composite: `criterionId` + `categoryId`. This prevents duplicate associations between the same criterion and category.

#### Physical table

- Stored in `criterions_categories`.

## General Relationships

The main schema relationships are:

- `Evaluation` 1:N `EvaluationDetail`
- `Criterion` 1:N `EvaluationDetail`
- `Criterion` 1:N `CriterionCategory`

## Design Notes

- The evaluator identity is not stored as a single foreign key. Instead, it is represented by `memberUserId`, `memberEventId`, and `memberRoleId`, mirroring the structure of `event-service.StaffEventMember`.
- `EvaluationDetail` and `CriterionCategory` are junction models with composite primary keys.
- `Criterion.weight` is relative inside its component and category; `EvaluateProjectUseCase` turns it into the effective weight, which is stored in `EvaluationDetail.weight` and used for the grade and the statistics.
- The schema uses `Timestamp` fields instead of `Timestamptz`, which means timezone handling depends on application and database configuration.
- Dynamic score ranges are validated in the use case, not through DTO `@Min` or `@Max` decorators.
- Unknown evaluation types are rejected with a controlled invalid-argument error.
