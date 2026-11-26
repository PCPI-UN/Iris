# Service Documentation

This directory contains service-level documentation for the PCPI microservice architecture.

## Operations & CI/CD

- [CI/CD Pipeline & Coolify Deployments](./cicd.md)

## Patterns

- [Writes that go together](./transactions.md): `UnitOfWork.run` to save several writes of a use case together or not at all

## Language

- [Glossary (Spanish terms)](./glossary.md): the Spanish word for each concept in API messages and emails

## Services

- [Gateway](./gateway/README.md)
- [Auth Service](./auth-service/README.md)
- [Evaluation Service](./evaluation-service/README.md)
- [Event Service](./event-service/event-service.md)
- [Invitation Service](./invitation-service/README.md)
- [Notification Service](./notification-service/README.md)
- [Project Service](./project-service/README.md)

## Shared Contracts

gRPC contracts are defined in:

```txt
libs/common/src/protos
```

Generated TypeScript contracts are emitted into:

```txt
libs/common/src/generated
```

## Grading Scales

Each event is graded with a grading scale of 4 levels (label and points) from the catalog of `evaluation-service`. Events are created and edited with `gradingScaleId`. See [Evaluation Service](./evaluation-service/README.md#grading-scales) for the rules.
