# Service Documentation

This directory contains service-level documentation for the PCPI microservice architecture.

## Operations & CI/CD

- [CI/CD Pipeline & Coolify Deployments](./cicd.md)

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

Each event is graded with a grading scale of 4 levels (label and points) from the catalog of `evaluation-service`. Events are created and edited with `gradingScaleId`; the deprecated `event.EvaluationType` is no longer accepted by the gateway. See [Evaluation Service](./evaluation-service/README.md#events-created-before-the-catalog) for the one-time assignment of the events created before the catalog.
