# Notification Service

## Purpose

This service sends notification emails through an email provider adapter. It exposes a gRPC interface for other services to request outbound email delivery.

The current implementation uses an application port for email delivery and an Azure-based infrastructure adapter.

See [email-provider-decision.md](./email-provider-decision.md) for the EmailJS / Azure ACS provider review.

## Main Components

### `SendEmailDto`

Represents an email delivery request.

Typical fields include:

- recipient address
- subject
- message body or template payload

### `SendEmailUseCase`

Coordinates email sending through the email service port.

### `EmailServicePort`

Application-level abstraction for sending emails. Infrastructure adapters implement this port.

### Azure Email Adapter

Infrastructure adapter that sends email through Azure Communication Email.

### gRPC Controller

The notification interface receives gRPC requests and delegates them to the application use case.

## Relationship With Other Services

- `invitation-service` can use notifications to send invitation or account setup emails.
- `auth-service` can use notifications for account lifecycle flows such as password reset or setup.
- `event-service`, `project-service`, and `evaluation-service` do not store notification state.

## Evaluation Type Interaction

Notification service does not participate in score validation, score mapping, or evaluation type resolution.

If future flows notify users about evaluation results, the grade and score semantics should be provided by `evaluation-service`; notification-service should only format and deliver the message.

## Design Notes

- Notification delivery is side-effect oriented and should remain behind an application port.
- Templates belong to notification infrastructure and should not contain business rules such as evaluation score mapping.
- Domain services should pass already-computed values to notification-service.
