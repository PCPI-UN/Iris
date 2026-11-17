import { Prisma } from '@prisma/client';
import { PrismaEmailDeliveryRepository } from '../prisma-email-delivery.repository';
import { PrismaService } from '../prisma.service';

describe('PrismaEmailDeliveryRepository', () => {
  const row = {
    id: 'd-1',
    idempotencyKey: 'invitation:abc:1',
    recipient: 'laura@test.local',
    template: 'PLATFORM_INVITATION',
    params: { firstName: 'Laura' },
    status: 'PENDING',
    provider: null,
    attempts: 0,
    lastError: null,
    nextAttemptAt: new Date('2026-11-08T10:05:00Z'),
    sentAt: null,
    createdAt: new Date('2026-11-08T10:00:00Z'),
    updatedAt: new Date('2026-11-08T10:00:00Z'),
  };

  const newDelivery = {
    idempotencyKey: 'invitation:abc:1',
    recipient: 'laura@test.local',
    template: 'PLATFORM_INVITATION',
    params: { firstName: 'Laura' },
    nextAttemptAt: new Date('2026-11-08T10:05:00Z'),
  };

  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  const build = (emailDelivery: Record<string, jest.Mock>) =>
    new PrismaEmailDeliveryRepository({
      emailDelivery,
    } as unknown as PrismaService);

  it('creates the delivery', async () => {
    const create = jest.fn().mockResolvedValue(row);

    const result = await build({ create }).createOrGet(newDelivery);

    expect(result).toEqual({ delivery: row, created: true });
  });

  it('returns the existing delivery when the key is already used', async () => {
    const existing = { ...row, status: 'SENT' };
    const create = jest.fn().mockRejectedValue(uniqueViolation());
    const findUnique = jest.fn().mockResolvedValue(existing);

    const result = await build({ create, findUnique }).createOrGet(newDelivery);

    expect(findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'invitation:abc:1' },
    });
    expect(result).toEqual({ delivery: existing, created: false });
  });

  it('rethrows any other error', async () => {
    const create = jest.fn().mockRejectedValue(new Error('connection lost'));

    await expect(build({ create }).createOrGet(newDelivery)).rejects.toThrow(
      'connection lost',
    );
  });

  it('stores null params as a database NULL', async () => {
    const update = jest.fn().mockResolvedValue({ ...row, params: null });

    await build({ update }).update('d-1', { status: 'SENT', params: null });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'd-1' },
      data: { status: 'SENT', params: Prisma.DbNull },
    });
  });

  it('claims a delivery only if nobody moved its next attempt', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const repository = build({ updateMany });
    const leaseUntil = new Date('2026-11-08T10:10:00Z');

    await expect(repository.claim(row, leaseUntil)).resolves.toBe(true);
    await expect(repository.claim(row, leaseUntil)).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'd-1',
        status: 'PENDING',
        nextAttemptAt: row.nextAttemptAt,
      },
      data: { nextAttemptAt: leaseUntil },
    });
  });

  it('finds due PENDING deliveries, oldest first', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const now = new Date('2026-11-08T10:06:00Z');

    await build({ findMany }).findDue(now, 20);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
  });
});
