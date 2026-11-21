import { PrismaService } from '../../../../../common/prisma/prisma.service';
import { PrismaUnitOfWork } from '../prisma-unit-of-work';

describe('PrismaUnitOfWork', () => {
  const fakeTx = { marker: 'tx' };

  const build = () => {
    const prisma = new PrismaService();
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(((work: (tx: unknown) => Promise<unknown>) =>
        work(fakeTx)) as never);
    return { prisma, uow: new PrismaUnitOfWork(prisma) };
  };

  it('runs the work with the repositories querying through the open transaction', async () => {
    const { prisma, uow } = build();

    const seen = await uow.run(async () => {
      await Promise.resolve();
      return prisma.db;
    });

    expect(seen).toBe(fakeTx);
  });

  it('rejects with the error thrown inside the work', async () => {
    const { uow } = build();

    await expect(
      uow.run(async () => {
        throw new Error('change log insert failed');
      }),
    ).rejects.toThrow('change log insert failed');
  });
});
