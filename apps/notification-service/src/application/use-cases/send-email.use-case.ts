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
 * Records the request and makes the first attempt right away. A request with
 * an idempotency key that was already used returns the existing delivery and
 * sends nothing. A failed first attempt is left for the retry worker.
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

    return this.attempt.execute(delivery);
  }
}
