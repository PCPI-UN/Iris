import emailjs from '@emailjs/nodejs';
import {
  EmailContent,
  EmailProvider,
} from '../../../application/ports/email-provider.port';

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  /** Minimum gap between two requests. EmailJS allows 1 request per second. */
  minIntervalMs?: number;
  /** Retries after a 429 before giving up. */
  maxRetries?: number;
  /** Wait before the first retry; doubles on each following one. */
  retryDelayMs?: number;
}

export type EmailJsSend = typeof emailjs.send;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const TOO_MANY_REQUESTS = 429;

/**
 * EmailJS. Every request (first try or retry) waits for its slot so the
 * service never exceeds 1 request per second, whether EmailJS is the primary
 * or the fallback. A 429 is retried with a growing wait before failing.
 */
export class EmailJsAdapter implements EmailProvider {
  readonly name = 'emailjs';
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly config: EmailJsConfig,
    private readonly sendRequest: EmailJsSend = emailjs.send.bind(emailjs),
    private readonly clock: Clock = systemClock,
  ) {
    this.minIntervalMs = config.minIntervalMs ?? 1_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1_000;
  }

  async send(email: EmailContent): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.waitForSlot();
        await this.request(email);
        return;
      } catch (error: unknown) {
        if (!isTooManyRequests(error) || attempt >= this.maxRetries) {
          throw toError(error);
        }
        await this.clock.sleep(this.retryDelayMs * 2 ** attempt);
      }
    }
  }

  private request({ to, subject, html }: EmailContent) {
    return this.sendRequest(
      this.config.serviceId,
      this.config.templateId,
      { to_email: to, subject, message_html: html },
      { publicKey: this.config.publicKey, privateKey: this.config.privateKey },
    );
  }

  // Queues callers so request start times are at least minIntervalMs apart
  private waitForSlot(): Promise<void> {
    const slot = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      this.lastRequestAt = this.clock.now();
    });
    this.queue = slot;
    return slot;
  }
}

function isTooManyRequests(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === TOO_MANY_REQUESTS;
}

// EmailJS rejects with { status, text }, not an Error
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  const { status, text } = (error ?? {}) as { status?: number; text?: string };
  return new Error(`EmailJS send failed (${status ?? '?'}): ${text ?? ''}`);
}
