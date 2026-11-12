import { PrismaPlatformStaffRepository } from '../prisma-platform-staff.repository';

describe('PrismaPlatformStaffRepository', () => {
  let prisma: any;
  let repository: PrismaPlatformStaffRepository;

  beforeEach(() => {
    prisma = {
      platformStaff: { upsert: jest.fn((args) => args) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    repository = new PrismaPlatformStaffRepository(prisma);
  });

  describe('assignRoles', () => {
    it('upserts each role as active, so a deactivated row is reactivated', async () => {
      await repository.assignRoles(5, [10, 3]);

      expect(prisma.platformStaff.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 5, roleId: 10 } },
        update: { active: true },
        create: { userId: 5, roleId: 10, active: true },
      });
      expect(prisma.platformStaff.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 5, roleId: 3 } },
        update: { active: true },
        create: { userId: 5, roleId: 3, active: true },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('uses the given transaction client and opens no transaction of its own', async () => {
      const tx = { platformStaff: { upsert: jest.fn().mockResolvedValue({}) } };

      await repository.assignRoles(5, [10], tx as any);

      expect(tx.platformStaff.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.platformStaff.upsert).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findActiveUsersByRoles', () => {
    it('filters active users with an active role among the requested ones', async () => {
      await repository.findActiveUsersByRoles({ roleIds: [9, 10], limit: 10 });

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        active: true,
        platformRoles: { some: { active: true, roleId: { in: [9, 10] } } },
      });
      expect(args.take).toBe(10);
      expect(args.select.platformRoles.where).toEqual({
        active: true,
        roleId: { in: [9, 10] },
      });
    });

    it('adds the case-insensitive name search and the ids filter when given', async () => {
      await repository.findActiveUsersByRoles({
        roleIds: [10],
        search: 'ana  gó',
        userIds: [4, 7],
        limit: 5,
      });

      const { where } = prisma.user.findMany.mock.calls[0][0];
      expect(where.id).toEqual({ in: [4, 7] });
      expect(where.AND).toEqual(
        ['ana', 'gó'].map((word) => ({
          OR: [
            { firstName: { contains: word, mode: 'insensitive' } },
            { lastName: { contains: word, mode: 'insensitive' } },
          ],
        })),
      );
    });

    it('maps each user with its matching role ids', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 4,
          firstName: 'Ana',
          lastName: null,
          platformRoles: [{ roleId: 9 }, { roleId: 10 }],
        },
      ]);

      await expect(
        repository.findActiveUsersByRoles({ roleIds: [9, 10], limit: 10 }),
      ).resolves.toEqual([
        { id: 4, firstName: 'Ana', lastName: null, roleIds: [9, 10] },
      ]);
    });
  });
});
