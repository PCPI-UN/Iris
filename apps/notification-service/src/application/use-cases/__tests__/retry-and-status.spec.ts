import { RetryDueEmailsUseCase } from '../retry-due-emails.use-case';
import { GetEmailStatusUseCase } from '../get-email-status.use-case';
import { AttemptEmailDelivery } from '../attempt-email-delivery';
import { EmailDeliveryRepositoryPort } from '../../ports/email-delivery.repository.port';
import { nextAttemptAt } from '../../../domain/email-delivery';
import { buildDelivery } from './delivery.fixture';

describe('RetryDueEmailsUseCase', () => {
  const now = new Date('2026-11-08T10:00:00Z');

  it('attempts only the deliveries it manages to claim', async () => {
    const due = [buildDelivery({ id: 'a' }), buildDelivery({ id: 'b' })];
    const findDue = jest.fn().mockResolvedValue(due);
    const claim = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const execute = jest.fn().mockResolvedValue(undefined);
    const useCase = new RetryDueEmailsUseCase(
      { findDue, claim } as unknown as EmailDeliveryRepositoryPort,
      { execute } as unknown as AttemptEmailDelivery,
    );

    const attempted = await useCase.execute(20, now);

    expect(findDue).toHaveBeenCalledWith(now, 20);
    expect(claim).toHaveBeenCalledWith(
      due[0],
      new Date('2026-11-08T10:05:00Z'),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(due[0]);
    expect(attempted).toBe(1);
  });
});

describe('GetEmailStatusUseCase', () => {
  const build = () => {
    const findByIdsOrKeys = jest.fn().mockResolvedValue([buildDelivery()]);
    const useCase = new GetEmailStatusUseCase({
      findByIdsOrKeys,
    } as unknown as EmailDeliveryRepositoryPort);
    return { useCase, findByIdsOrKeys };
  };

  it('looks up by ids and keys, without blanks or repeats', async () => {
    const { useCase, findByIdsOrKeys } = build();

    await useCase.execute({
      ids: ['d-1', 'd-1', ' '],
      idempotencyKeys: [' invitation:abc:1 '],
    });

    expect(findByIdsOrKeys).toHaveBeenCalledWith(['d-1'], ['invitation:abc:1']);
  });

  it('returns nothing without ids or keys', async () => {
    const { useCase, findByIdsOrKeys } = build();

    await expect(useCase.execute({})).resolves.toEqual([]);
    expect(findByIdsOrKeys).not.toHaveBeenCalled();
  });

  it('rejects more than 100 lookups', async () => {
    const { useCase } = build();
    const ids = Array.from({ length: 101 }, (_, i) => `d-${i}`);

    await expect(useCase.execute({ ids })).rejects.toMatchObject({
      error: expect.objectContaining({ code: 3 }) as object,
    });
  });
});

describe('nextAttemptAt', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const policy = { maxAttempts: 4, baseDelayMs: 60_000 };

  it.each([
    [1, '2026-11-08T10:01:00.000Z'],
    [2, '2026-11-08T10:02:00.000Z'],
    [3, '2026-11-08T10:04:00.000Z'],
  ])('after %p failed attempts waits until %p', (attempts, expected) => {
    expect(nextAttemptAt(attempts, policy, now)?.toISOString()).toBe(expected);
  });

  it('returns null once the attempts are exhausted', () => {
    expect(nextAttemptAt(4, policy, now)).toBeNull();
  });
});
