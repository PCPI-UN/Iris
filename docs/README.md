# Service Documentation

This directory contains service-level documentation for the PCPI microservice architecture.

## Services

- [Gateway](./gateway/gateway.md)
- [Auth Service](./auth-service/README.md)
- [Evaluation Service](./evaluation-service/evaluation-service.md)
- [Event Service](./event-service/event-service.md)
- [Invitation Service](./invitation-service/invitation-service.md)
- [Notification Service](./notification-service/notification-service.md)
- [Project Service](./project-service/project-service.md)

## Shared Contracts

gRPC contracts are defined in:

```txt
libs/common/src/protos
```

Generated TypeScript contracts are emitted into:

```txt
libs/common/src/generated
```

## Evaluation Type Contract

The shared `event.EvaluationType` proto enum currently includes:

- `FINAL_PROJECTS`
- `ZERO_TO_FIVE`
- `ZERO_TO_HUNDRED`

`event-service` owns the configured evaluation type for each event.

`evaluation-service` resolves the type internally from:

```txt
projectId -> project.eventId -> event.evaluationType
```

Evaluation requests must not duplicate `evaluationType`.

Current implemented behavior:

- `FINAL_PROJECTS`: accepts raw scores `1`, `2`, `3`, and `4`; maps them to `25`, `55`, `75`, and `90`.

Prepared but not implemented in evaluation-service yet:

- `ZERO_TO_FIVE`
- `ZERO_TO_HUNDRED`

The final grade formula remains a weighted sum and is not changed by the evaluation type refactor.
