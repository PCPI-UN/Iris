import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  EmailDeliveryStatus,
  EmailDelivery as EmailDeliveryMessage,
  EmailTemplate,
  GetEmailStatusRequest,
  GetEmailStatusResponse,
  NOTIFICATION_SERVICE_NAME,
  SendEmailResponse,
} from '@app/common/generated/notification';
import { SendEmailUseCase } from '../../application/use-cases/send-email.use-case';
import { GetEmailStatusUseCase } from '../../application/use-cases/get-email-status.use-case';
import { SendEmailDto } from '../../application/dto/send-email.dto';
import { EmailDelivery } from '../../domain/email-delivery';

@Controller()
export class NotificationController {
  constructor(
    private readonly sendEmailUseCase: SendEmailUseCase,
    private readonly getEmailStatusUseCase: GetEmailStatusUseCase,
  ) {}

  @GrpcMethod(NOTIFICATION_SERVICE_NAME, 'SendEmail')
  async sendEmail(request: SendEmailDto): Promise<SendEmailResponse> {
    const delivery = await this.sendEmailUseCase.execute(request);
    return {
      // Sent, or queued for a retry: the caller's flow can go on
      success: delivery.status !== 'FAILED',
      delivery: toMessage(delivery),
    };
  }

  @GrpcMethod(NOTIFICATION_SERVICE_NAME, 'GetEmailStatus')
  async getEmailStatus(
    request: GetEmailStatusRequest,
  ): Promise<GetEmailStatusResponse> {
    const deliveries = await this.getEmailStatusUseCase.execute(request);
    return { deliveries: deliveries.map(toMessage) };
  }
}

export function toMessage(delivery: EmailDelivery): EmailDeliveryMessage {
  return {
    id: delivery.id,
    idempotencyKey: delivery.idempotencyKey ?? undefined,
    to: delivery.recipient,
    template:
      EmailTemplate[delivery.template as keyof typeof EmailTemplate] ??
      EmailTemplate.UNRECOGNIZED,
    status: EmailDeliveryStatus[delivery.status],
    provider: delivery.provider ?? undefined,
    attempts: delivery.attempts,
    lastError: delivery.lastError ?? undefined,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
    sentAt: delivery.sentAt?.toISOString(),
    nextAttemptAt: delivery.nextAttemptAt?.toISOString(),
  };
}
