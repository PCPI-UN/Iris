import { EmailRetryWorker } from '../email-retry.worker';
import { RetryDueEmailsUseCase } from '../../../application/use-cases/retry-due-emails.use-case';

describe('EmailRetryWorker', () => {
  const build = (execute: jest.Mock, pollMs = 15_000) =>
    new EmailRetryWorker({ execute } as unknown as RetryDueEmailsUseCase, {
      pollMs,
      batchSize: 20,
    });

  afterEach(() => jest.useRealTimers());

  it('retries due emails on every interval', async () => {
    jest.useFakeTimers();
    const execute = jest.fn().mockResolvedValue(0);
    const worker = build(execute);

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(30_000);
    worker.onModuleDestroy();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith(20);
  });

  it('does not start a pass while the previous one is running', async () => {
    let finish: () => void = () => undefined;
    const execute = jest.fn(
      () => new Promise<number>((resolve) => (finish = () => resolve(0))),
    );
    const worker = build(execute);

    const first = worker.tick();
    await worker.tick();
    finish();
    await first;

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('keeps running after a failed pass', async () => {
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(0);
    const worker = build(execute);

    await worker.tick();
    await worker.tick();

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does nothing when disabled', async () => {
    jest.useFakeTimers();
    const execute = jest.fn();
    const worker = build(execute, 0);

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(execute).not.toHaveBeenCalled();
  });
});
