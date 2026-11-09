import { EmailDelivery } from '../../domain/email-delivery';

export interface NewEmailDelivery {
  idempotencyKey: string | null;
  recipient: string;
  template: string;
  params: Record<string, unknown>;
  /** Lease: the retry worker leaves the row alone until then */
  nextAttemptAt: Date;
}

export type EmailDeliveryUpdate = Partial<
  Pick<
    EmailDelivery,
    | 'status'
    | 'provider'
    | 'attempts'
    | 'lastError'
    | 'nextAttemptAt'
    | 'sentAt'
    | 'params'
  >
>;

export abstract class EmailDeliveryRepositoryPort {
  /**
   * Inserts the delivery. When another one already has the same idempotency
   * key, returns that one with `created: false` and inserts nothing.
   */
  abstract createOrGet(
    data: NewEmailDelivery,
  ): Promise<{ delivery: EmailDelivery; created: boolean }>;

  abstract update(
    id: string,
    data: EmailDeliveryUpdate,
  ): Promise<EmailDelivery>;

  /** PENDING deliveries whose next attempt is due, oldest first. */
  abstract findDue(now: Date, limit: number): Promise<EmailDelivery[]>;

  /**
   * Takes a due delivery for one attempt by moving its next attempt to
   * `leaseUntil`. Returns false when another worker took it first.
   */
  abstract claim(
    delivery: Pick<EmailDelivery, 'id' | 'nextAttemptAt'>,
    leaseUntil: Date,
  ): Promise<boolean>;

  abstract findByIdsOrKeys(
    ids: string[],
    idempotencyKeys: string[],
  ): Promise<EmailDelivery[]>;
}
