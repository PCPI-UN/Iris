import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { EventMemberRepository } from '../../domain/repositories/event-member.repository';
import { EventMember } from '../../domain/entities/event-member.entity';

@Injectable()
export class PrismaEventMemberRepository implements EventMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  async create(input: {
    userId: number;
    eventId: number;
    roleId: number;
    active?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<EventMember> {
    const result = await this.db.staffEventMember.create({
      data: {
        userId: input.userId,
        eventId: input.eventId,
        roleId: input.roleId,
        active: input.active ?? true,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });

    return result as EventMember;
  }

  async softDelete(userId: number, eventId: number): Promise<void> {
    await this.db.staffEventMember.updateMany({
      where: { userId, eventId },
      data: { active: false, updatedAt: new Date() },
    });
  }

  async findByUserAndEvent(
    userId: number,
    eventId: number,
  ): Promise<EventMember | null> {
    const result = await this.db.staffEventMember.findFirst({
      where: { userId, eventId },
    });

    return result as EventMember | null;
  }

  async findActiveByUserAndEvent(
    userId: number,
    eventId: number,
  ): Promise<EventMember | null> {
    const result = await this.db.staffEventMember.findFirst({
      where: {
        userId,
        eventId,
        active: true,
      },
    });

    return result as EventMember | null;
  }

  async findActiveEventIdsByUserAndRole(
    userId: number,
    roleId: number,
  ): Promise<number[]> {
    const rows = await this.db.staffEventMember.findMany({
      where: { userId, roleId, active: true },
      select: { eventId: true },
    });
    return rows.map((row: { eventId: number }) => row.eventId);
  }

  async findByEventId(
    eventId: number,
    roleId?: number,
    page = 1,
    limit = 20,
    activeOnly = true,
  ): Promise<[EventMember[], number]> {
    const where: any = {
      eventId,
    };

    if (activeOnly) {
      where.active = true;
    }

    if (roleId !== undefined) {
      where.roleId = roleId;
    }

    // Calculate skip from page and limit
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.db.staffEventMember.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.staffEventMember.count({ where }),
    ]);

    return [data as EventMember[], total];
  }
}
