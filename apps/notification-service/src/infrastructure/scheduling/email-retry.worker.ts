import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { RetryDueEmailsUseCase } from '../../application/use-cases/retry-due-emails.use-case';

export const EMAIL_RETRY_WORKER_OPTIONS = Symbol('EMAIL_RETRY_WORKER_OPTIONS');

export interface EmailRetryWorkerOptions {
  /** How often to look for due retries; 0 disables the worker */
  pollMs: number;
  batchSize: number;
}

/** Polls for PENDING deliveries whose wait is over and retries them. */
@Injectable()
export class EmailRetryWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EmailRetryWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly retryDueEmails: RetryDueEmailsUseCase,
    @Inject(EMAIL_RETRY_WORKER_OPTIONS)
    private readonly options: EmailRetryWorkerOptions,
  ) {}

  onApplicationBootstrap() {
    if (this.options.pollMs <= 0) {
      this.logger.warn('Email retry worker disabled (EMAIL_RETRY_POLL_MS=0)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.options.pollMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass; skipped while the previous one is still running. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const attempted = await this.retryDueEmails.execute(
        this.options.batchSize,
      );
      if (attempted) this.logger.log(`Retried ${attempted} email(s)`);
    } catch (error: unknown) {
      this.logger.error('Email retry pass failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
