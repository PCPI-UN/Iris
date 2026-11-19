import { PrismaService } from '../../../../../common/prisma/prisma.service';
import { PrismaInvitationRepository } from '../prisma-invitation.repository';

describe('PrismaInvitationRepository.findByEventId', () => {
  let prisma: { invitation: { findMany: jest.Mock; count: jest.Mock } };
  let repo: PrismaInvitationRepository;

  beforeEach(() => {
    prisma = {
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    repo = new PrismaInvitationRepository(prisma as unknown as PrismaService);
  });

  it('lists and counts only EVENT invitations, not projects sharing the id', async () => {
    await repo.findByEventId(3, 2, 10);

    const where = { targetType: 'EVENT', targetId: 3 };
    expect(prisma.invitation.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.invitation.count).toHaveBeenCalledWith({ where });
  });

  it('keeps the role filter', async () => {
    await repo.findByEventId(3, 1, 10, 5);

    expect(prisma.invitation.count).toHaveBeenCalledWith({
      where: {
        targetType: 'EVENT',
        targetId: 3,
        roles: { some: { roleId: 5 } },
      },
    });
  });
});
