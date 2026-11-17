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
  /** First attempts running in the background */
  private readonly inFlight = new Set<Promise<void>>();

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

    const running = this.attempt
      .execute(delivery)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(
          `First attempt of delivery ${delivery.id} failed; the retry worker takes it when its lease expires`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => this.inFlight.delete(running));
    this.inFlight.add(running);
    return delivery;
  }

  /**
   * Waits for the attempts running in the background, up to `timeoutMs`, so a
   * shutdown does not cut them. Whatever is left keeps its lease and the retry
   * worker takes it later.
   */
  async drain(timeoutMs: number): Promise<void> {
    if (!this.inFlight.size) return;
    this.logger.log(`Waiting for ${this.inFlight.size} email attempts`);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([Promise.allSettled([...this.inFlight]), timeout]);
    clearTimeout(timer);
    if (this.inFlight.size) {
      this.logger.warn(
        `${this.inFlight.size} email attempts left for the retry worker`,
      );
    }
  }
}
