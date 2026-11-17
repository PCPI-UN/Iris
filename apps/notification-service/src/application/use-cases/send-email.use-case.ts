import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EmailTemplate } from '@app/common/generated/notification';
import { SendEmailDto } from '../dto/send-email.dto';
import { EmailDelivery } from '../../domain/email-delivery';
import { EmailDeliveryRepositoryPort } from '../ports/email-delivery.repository.port';
import {
  ATTEMPT_LEASE_MS,
  AttemptEmailDelivery,
} from './attempt-email-delivery';

/**
 * Records the request and starts the first attempt without waiting for the
 * provider: it returns the delivery as recorded (PENDING) and the real status
 * is read later with GetEmailStatus. If the process dies mid-attempt, the row's
 * lease expires and the retry worker takes it. A request with an idempotency
 * key that was already used returns the existing delivery and sends nothing.
 * A failed first attempt is left for the retry worker.
 */
@Injectable()
export class SendEmailUseCase {
  private readonly logger = new Logger(SendEmailUseCase.name);

  constructor(
    private readonly repository: EmailDeliveryRepositoryPort,
    private readonly attempt: AttemptEmailDelivery,
  ) {}

  async execute(dto: SendEmailDto): Promise<EmailDelivery> {
    const template = EmailTemplate[dto.template] as string | undefined;
    if (template === undefined || dto.template === EmailTemplate.UNRECOGNIZED) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Unknown email template: ${dto.template}`,
      });
    }

    const { delivery, created } = await this.repository.createOrGet({
      idempotencyKey: dto.idempotencyKey?.trim() || null,
      recipient: dto.to,
      template,
      params: dto.params ?? {},
      nextAttemptAt: new Date(Date.now() + ATTEMPT_LEASE_MS),
    });

    if (!created) {
      this.logger.log(
        `Repeated request for delivery ${delivery.id} (${delivery.status}); nothing sent`,
      );
      return delivery;
    }

    void this.attempt.execute(delivery).catch((error: unknown) => {
      this.logger.error(
        `First attempt of delivery ${delivery.id} failed; the retry worker takes it when its lease expires`,
        error instanceof Error ? error.stack : String(error),
      );
    });
    return delivery;
  }
}
