import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { InvitationRepositoryPort } from '@invitations/domain/repositories/invitation.repository.port';
import { Invitation } from '@invitations/domain/entities/invitation.entity';
import { InvitationMapper } from './mappers/invitation.mapper';
import { normalizeEmail } from '@app/common/utils/email.util';

@Injectable()
export class PrismaInvitationRepository implements InvitationRepositoryPort {
  constructor(private readonly prisma: PrismaService) { }

  async save(invitation: Invitation): Promise<Invitation> {
    const persistenceData = InvitationMapper.toPersistence(invitation);

    const prismaInvitation = await this.prisma.invitation.upsert({
      where: { id: invitation.id },
      update: persistenceData,
      create: persistenceData,
    });

    return InvitationMapper.toDomain(prismaInvitation);
  }

  async findById(id: string): Promise<Invitation | null> {
    const prismaInvitation = await this.prisma.invitation.findUnique({
      where: { id },
    });

    return prismaInvitation ? InvitationMapper.toDomain(prismaInvitation) : null;
  }

  async findByToken(token: string): Promise<Invitation | null> {
    const prismaInvitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    return prismaInvitation ? InvitationMapper.toDomain(prismaInvitation) : null;
  }

  async findByEmail(email: string): Promise<Invitation[]> {
    const prismaInvitations = await this.prisma.invitation.findMany({
      where: { email: this.emailMatches(email) },
      orderBy: { createdAt: 'desc' },
    });

    return prismaInvitations.map(InvitationMapper.toDomain);
  }

  async findByTarget(targetType: string, targetId: number): Promise<Invitation[]> {
    const prismaInvitations = await this.prisma.invitation.findMany({
      where: {
        targetType: targetType as any,
        targetId
      },
      orderBy: { createdAt: 'desc' },
    });

    return prismaInvitations.map(InvitationMapper.toDomain);
  }

  async findPendingByEmailAndTargetType(email: string, targetType: string, targetId: number): Promise<Invitation | null> {
    const prismaInvitation = await this.prisma.invitation.findFirst({
      where: {
        email: this.emailMatches(email),
        targetType: targetType as any,
        targetId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    return prismaInvitation ? InvitationMapper.toDomain(prismaInvitation) : null;
  }

  async findAcceptedByEmailAndTargetType(email: string, targetType: string, targetId: number): Promise<Invitation | null> {
    const prismaInvitation = await this.prisma.invitation.findFirst({
      where: {
        email: this.emailMatches(email),
        targetType: targetType as any,
        targetId,
        status: 'ACCEPTED',
      },
      orderBy: { createdAt: 'desc' },
    });

    return prismaInvitation ? InvitationMapper.toDomain(prismaInvitation) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.invitation.delete({
      where: { id },
    });
  }

  async findByEventId(eventId: number, page: number, limit: number, roleId?: number): Promise<{ invitations: Invitation[]; total: number }> {
    const skip = (page - 1) * limit;
    const where: any = {
      targetId: eventId,
    };

    if (roleId) {
      where.roles = {
        some: {
          roleId: roleId,
        },
      };
    }

    const [invitations, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invitation.count({
        where,
      }),
    ]);

    return {
      invitations: invitations.map(InvitationMapper.toDomain),
      total,
    };
  }

  async findByUserId(userId: number, status: string | undefined, page: number, limit: number): Promise<{ invitations: Invitation[]; total: number }> {
    const skip = (page - 1) * limit;
    const whereClause: any = {
      invitedUserId: userId,
    };

    if (status) {
      whereClause.status = status as any;
    } else {
      whereClause.status = 'PENDING';
    }

    const [invitations, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invitation.count({
        where: whereClause,
      }),
    ]);

    return {
      invitations: invitations.map(InvitationMapper.toDomain),
      total,
    };
  }

  private emailMatches(email: string) {
    return { equals: normalizeEmail(email), mode: 'insensitive' as const };
  }
}
