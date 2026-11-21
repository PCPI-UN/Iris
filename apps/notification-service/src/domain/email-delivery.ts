export type EmailDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

/** One email request and how its delivery went. */
export interface EmailDelivery {
  id: string;
  idempotencyKey: string | null;
  recipient: string;
  /** EmailTemplate enum name, e.g. "PASSWORD_RESET" */
  template: string;
  /** Kept while a retry may need them; cleared once the status is final */
  params: Record<string, unknown> | null;
  status: EmailDeliveryStatus;
  provider: string | null;
  /** Operation id sent to a provider that dedupes by it; reused while the outcome is unknown */
  providerRef: string | null;
  /** When the provider accepted the email; while PENDING its final status is still to be confirmed */
  acceptedAt: Date | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetryPolicy {
  /** Total attempts, the first one included */
  maxAttempts: number;
  /** Wait after the first failed attempt; doubles after each following one */
  baseDelayMs: number;
  /** Wait between the checks of an accepted email's final status */
  confirmDelayMs: number;
  /** After this long without a final status, an accepted email is recorded as SENT */
  confirmTimeoutMs: number;
}

/**
 * The last attempt got no answer from the provider that holds `providerRef`,
 * so that provider may have the email.
 */
export function isInDoubt(
  delivery: Pick<EmailDelivery, 'providerRef' | 'acceptedAt' | 'lastError'>,
): boolean {
  return (
    delivery.providerRef !== null &&
    delivery.acceptedAt === null &&
    delivery.lastError !== null
  );
}

/** Accepted by a provider and waiting for its final status. */
export function isAwaitingConfirmation(
  delivery: Pick<EmailDelivery, 'status' | 'providerRef' | 'acceptedAt'>,
): boolean {
  return (
    delivery.status === 'PENDING' &&
    delivery.providerRef !== null &&
    delivery.acceptedAt !== null
  );
}

/** When to try again after `attempts` failed attempts, or null when they are exhausted. */
export function nextAttemptAt(
  attempts: number,
  policy: RetryPolicy,
  now: Date,
): Date | null {
  if (attempts >= policy.maxAttempts) return null;
  const delay = policy.baseDelayMs * 2 ** Math.max(attempts - 1, 0);
  return new Date(now.getTime() + delay);
}
