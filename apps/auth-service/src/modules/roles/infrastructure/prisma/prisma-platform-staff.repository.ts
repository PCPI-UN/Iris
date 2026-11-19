import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import {
  ActiveRole,
  FindActiveUsersByRolesCriteria,
  PlatformStaffRepositoryPort,
  UserWithRoleIds,
} from '@roles/domain/repositories/platform-staff.repository.port';
import { PlatformStaff } from '@roles/domain/entities/platform-staff.entity';
import { TransactionClient } from '@common/prisma/types/transaction-client.type';

@Injectable()
export class PrismaPlatformStaffRepository
  implements PlatformStaffRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findActiveRoles(userId: number): Promise<ActiveRole[]> {
    const rows = await this.prisma.platformStaff.findMany({
      where: { userId, active: true },
      include: { role: { include: { permissions: true } } },
    });

    return rows.map(({ role }) => ({
      id: role.id,
      name: role.name,
      scope: role.scope,
      permissions: role.permissions.map(
        (permission) => `${permission.action}:${permission.resource}`,
      ),
    }));
  }

  async setActiveRoles(userId: number, roleIds: number[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.platformStaff.updateMany({
        where: { userId, active: true, roleId: { notIn: roleIds } },
        data: { active: false },
      }),
      ...roleIds.map((roleId) =>
        this.prisma.platformStaff.upsert({
          where: { userId_roleId: { userId, roleId } },
          update: { active: true },
          create: { userId, roleId, active: true },
        }),
      ),
    ]);
  }

  async findByUserIdAndRoleId(
    userId: number,
    roleId: number,
  ): Promise<PlatformStaff | null> {
    const platformStaff = await this.prisma.platformStaff.findUnique({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
      include: {
        role: true,
        user: true,
      },
    });

    if (!platformStaff) {
      return null;
    }

    return new PlatformStaff(
      platformStaff.userId,
      platformStaff.roleId,
      platformStaff.active,
      {
        id: platformStaff.role.id,
        name: platformStaff.role.name,
        scope: platformStaff.role.scope,
        description: platformStaff.role.description,
      },
      {
        id: platformStaff.user.id,
        email: platformStaff.user.email,
        firstName: platformStaff.user.firstName,
        lastName: platformStaff.user.lastName,
      },
    );
  }

  async countActiveAdminsByRoleId(
    roleId: number,
    excludeUserId: number,
  ): Promise<number> {
    // A deactivated user cannot act as an admin even if the role row is still active
    return this.prisma.platformStaff.count({
      where: {
        userId: { not: excludeUserId },
        roleId,
        active: true,
        user: { active: true },
      },
    });
  }

  async deactivate(userId: number, roleId: number): Promise<void> {
    await this.prisma.platformStaff.update({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
      data: {
        active: false,
      },
    });
  }

  async assignRoles(
    userId: number,
    roleIds: number[],
    tx?: TransactionClient,
  ): Promise<void> {
    const prisma = tx ?? this.prisma;

    // upsert (not createMany) so a row deactivated earlier becomes active again
    const upserts = roleIds.map((roleId) =>
      prisma.platformStaff.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: { active: true },
        create: { userId, roleId, active: true },
      }),
    );

    if (tx) {
      await Promise.all(upserts);
    } else {
      await this.prisma.$transaction(upserts);
    }
  }

  async findActiveUsersByRoles(
    criteria: FindActiveUsersByRolesCriteria,
  ): Promise<UserWithRoleIds[]> {
    const { roleIds, search, userIds, limit } = criteria;
    const activeRoleFilter = { active: true, roleId: { in: roleIds } };
    // Every word must appear in the first or last name, so "Laura Gó" finds Laura Gómez
    const words = search?.split(/\s+/).filter(Boolean) ?? [];

    const users = await this.prisma.user.findMany({
      where: {
        active: true,
        platformRoles: { some: activeRoleFilter },
        ...(userIds?.length ? { id: { in: userIds } } : {}),
        ...(words.length
          ? {
              AND: words.map((word) => ({
                OR: [
                  { firstName: { contains: word, mode: 'insensitive' as const } },
                  { lastName: { contains: word, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        platformRoles: { where: activeRoleFilter, select: { roleId: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      roleIds: user.platformRoles.map((row) => row.roleId),
    }));
  }
}
