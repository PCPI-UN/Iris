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

### Rubric And Grade Rules

The rubric of a project is the set of active criteria associated with the project's course in the project's event. When a juror submits an evaluation:

1. The rubric weights must add up to 100% (tolerance `1e-6`). Otherwise the evaluation is rejected with `FAILED_PRECONDITION`.
2. Every criterion of the rubric must be scored exactly once. Missing, repeated or foreign criteria are rejected with `INVALID_ARGUMENT`.
3. The grade is a weighted sum, stored rounded to 2 decimals:

```txt
grade = round2(sum(mappedScore * criterion.weight))
```

Project averages returned by `getProjectStats` and `getTopProjectsByCourse` are also rounded to 2 decimals, using the same half-up rule as the gateway ranking (`roundRankingGrade`), so the ranking positions, the co-winner detection and the Excel report compare and show the same value.

### Components And Weights

A component (e.g. Comunicación Escrita 30%, Descripción del Diseño 40%, Comunicación Oral 30%) has a configured weight. That weight is split in equal parts among its active criteria (`component.weight / activeCriteria`), and recalculated whenever a criterion is added, moved, deactivated or the component weight changes. A weight sent for a criterion inside a component is ignored. Criteria without a component keep their own weight.

- The component weights of an event cannot exceed 100%.
- Once an event has evaluations, its rubric is locked: criteria cannot be created, deleted, deactivated, moved between components or courses, or change weight, and components cannot change weight or be deleted. Names and descriptions can still be edited.
- A component with active criteria cannot be deleted.
- Historical grades are never recalculated.

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
- `weight`: numeric weight of the criterion in the evaluation process.
- `active`: indicates whether the criterion is currently active.
- `category`: optional grouping label for the criterion.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

#### External references

- `eventId`: references `event-service.event`.

#### Relationships

- One `Criterion` has many `EvaluationDetail` records.
- One `Criterion` has many `CriterionCategory` records.

#### Physical table

- Stored in `criterions`.

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
- `Criterion.weight` is used by `EvaluateProjectUseCase` to calculate the final weighted grade after score mapping.
- The schema uses `Timestamp` fields instead of `Timestamptz`, which means timezone handling depends on application and database configuration.
- Dynamic score ranges are validated in the use case, not through DTO `@Min` or `@Max` decorators.
- Unknown evaluation types are rejected with a controlled invalid-argument error.
