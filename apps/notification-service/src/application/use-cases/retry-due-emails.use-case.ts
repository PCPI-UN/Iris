import { Injectable } from '@nestjs/common';
import { EmailDeliveryRepositoryPort } from '../ports/email-delivery.repository.port';
import {
  ATTEMPT_LEASE_MS,
  AttemptEmailDelivery,
} from './attempt-email-delivery';

/**
 * Retries the PENDING deliveries whose wait is over. Each row is claimed
 * first, so two workers never attempt the same delivery at the same time.
 */
@Injectable()
export class RetryDueEmailsUseCase {
  constructor(
    private readonly repository: EmailDeliveryRepositoryPort,
    private readonly attempt: AttemptEmailDelivery,
  ) {}

  /** Returns how many deliveries were attempted. */
  async execute(batchSize: number, now = new Date()): Promise<number> {
    const due = await this.repository.findDue(now, batchSize);
    let attempted = 0;

    for (const delivery of due) {
      const leaseUntil = new Date(now.getTime() + ATTEMPT_LEASE_MS);
      if (!(await this.repository.claim(delivery, leaseUntil))) continue;

      await this.attempt.execute(delivery);
      attempted++;
    }

    return attempted;
  }
}
