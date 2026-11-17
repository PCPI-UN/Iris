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
