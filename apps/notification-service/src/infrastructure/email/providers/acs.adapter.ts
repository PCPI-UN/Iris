import {
  EmailClient,
  EmailMessage,
  EmailSendResult,
} from '@azure/communication-email';
import {
  ConfirmOutcome,
  EmailContent,
  EmailInDoubtError,
  EmailProvider,
  SendOutcome,
} from '../../../application/ports/email-provider.port';

export interface AcsConfig {
  connectionString: string;
  senderAddress: string;
  /** Limit for one call to Azure, the SDK's own retries included */
  timeoutMs?: number;
  /** Retries of the SDK on 429, 5xx and network errors; 0 when absent */
  maxRetries?: number;
  /** Clock, for tests */
  now?: () => number;
}

interface RequestOptions {
  abortSignal?: AbortSignal;
}

export interface AcsClient {
  beginSend: EmailClient['beginSend'];
  getSendResult(
    operationId: string,
    options?: RequestOptions,
  ): Promise<EmailSendResult>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** Pause after a 429 without a usable `Retry-After` */
const DEFAULT_PAUSE_MS = 60_000;
/** Longest pause honored, so a bad header cannot silence ACS for long */
const MAX_PAUSE_MS = 15 * 60_000;
const OPERATION_ID_TAKEN = 'OperationIdAlreadyExists';
/** The request never reached Azure, so it cannot have taken the email */
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

/**
 * Azure Communication Services Email. Each delivery sends its own operation
 * id (`Operation-Id`); Azure rejects a repeated id with
 * `OperationIdAlreadyExists` and does not send the email again. The adapter
 * returns once Azure accepted the email (202) and does not wait for the
 * delivery: `confirm` reads the final status later. After a 429 ACS is
 * paused (`Retry-After`, 60 s without it): `send` rejects without calling
 * Azure, so the dispatcher goes straight to the next provider.
 */
export class AcsAdapter implements EmailProvider {
  readonly name = 'acs';
  private readonly timeoutMs: number;
  private readonly now: () => number;
  /** In memory, per process */
  private pausedUntil = 0;

  constructor(
    private readonly config: AcsConfig,
    private readonly client: AcsClient = sdkClient(
      config.connectionString,
      config.maxRetries ?? 0,
    ),
  ) {
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = config.now ?? Date.now;
  }

  async send(
    { to, subject, html, text }: EmailContent,
    ref?: string,
  ): Promise<SendOutcome> {
    if (!ref) throw new Error('ACS needs the operation id of the delivery');

    const remaining = this.pausedUntil - this.now();
    if (remaining > 0) {
      throw new Error(
        `ACS paused for ${Math.ceil(remaining / 1000)} s after a 429`,
      );
    }

    const message: EmailMessage = {
      senderAddress: this.config.senderAddress,
      recipients: { to: [{ address: to }] },
      content: { subject, plainText: text, html },
    };

    // beginSend also reads the status once after the 202; if only that read
    // fails, Azure already took the email.
    let accepted = false;
    try {
      await this.client.beginSend(message, {
        operationId: ref,
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        onResponse: (response) => {
          if (response.request.method === 'POST' && response.status === 202) {
            accepted = true;
          }
        },
      });
      return 'accepted';
    } catch (error: unknown) {
      if (accepted) return 'accepted';
      if (isOperationIdTaken(error)) return this.alreadyTaken(ref);
      if (isThrottled(error)) this.pause(error);
      if (mayHaveTaken(error)) {
        throw new EmailInDoubtError(`ACS gave no answer for ${ref}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async confirm(ref: string): Promise<ConfirmOutcome> {
    const result = await this.client.getSendResult(ref, {
      abortSignal: AbortSignal.timeout(this.timeoutMs),
    });
    switch (result.status) {
      case 'Succeeded':
        return { status: 'sent' };
      case 'Failed':
      case 'Canceled':
        return {
          status: 'failed',
          error: `ACS send ${result.status}: ${result.error?.message ?? 'no error detail'}`,
        };
      default:
        return { status: 'pending' };
    }
  }

  private pause(error: unknown): void {
    const wait = retryAfterMs(error, this.now()) ?? DEFAULT_PAUSE_MS;
    this.pausedUntil = this.now() + Math.min(wait, MAX_PAUSE_MS);
  }

  /** An earlier attempt with this id reached Azure: report how it went. */
  private async alreadyTaken(ref: string): Promise<SendOutcome> {
    let outcome: ConfirmOutcome;
    try {
      outcome = await this.confirm(ref);
    } catch {
      // Azure has the email; its status is confirmed later
      return 'accepted';
    }
    if (outcome.status === 'failed') throw new Error(outcome.error);
    return outcome.status === 'sent' ? 'sent' : 'accepted';
  }
}

/**
 * SDK 1.1.0 has no public method to read the status of an operation by id;
 * the generated client it wraps does. That client is private, so a new SDK
 * version may drop it: a unit test checks it with the installed version, and
 * ACS is skipped without it.
 */
export function sdkClient(connectionString: string, maxRetries = 0): AcsClient {
  const client = new EmailClient(connectionString, {
    retryOptions: { maxRetries },
  });
  const generated = (
    client as unknown as {
      generatedClient?: { email?: Partial<Pick<AcsClient, 'getSendResult'>> };
    }
  ).generatedClient?.email;
  const getSendResult = generated?.getSendResult?.bind(generated);
  if (!getSendResult) {
    throw new Error(
      '@azure/communication-email no longer exposes getSendResult; check the installed version',
    );
  }
  return { beginSend: client.beginSend.bind(client), getSendResult };
}

function isThrottled(error: unknown): boolean {
  return (error as { statusCode?: number } | null)?.statusCode === 429;
}

/** `Retry-After` of a 429: seconds or an HTTP date. */
function retryAfterMs(error: unknown, now: number): number | undefined {
  const headers = (
    error as { response?: { headers?: { get?: (n: string) => unknown } } }
  )?.response?.headers;
  const raw = headers?.get?.('retry-after');
  if (typeof raw !== 'string') return undefined;
  const seconds = Number(raw);
  if (raw.trim() && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function isOperationIdTaken(error: unknown): boolean {
  const { statusCode, code } = (error ?? {}) as {
    statusCode?: number;
    code?: string;
  };
  return statusCode === 400 && code === OPERATION_ID_TAKEN;
}

/** Timeout, 5xx or a connection lost after the request left: Azure may have the email. */
function mayHaveTaken(error: unknown): boolean {
  const { statusCode, code } = (error ?? {}) as {
    statusCode?: number;
    code?: string;
  };
  if (typeof statusCode === 'number') return statusCode >= 500;
  return !(code && NOT_SENT_CODES.has(code));
}
