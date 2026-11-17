import { Injectable } from '@nestjs/common';
import { EmailDelivery as EmailDeliveryRow, Prisma } from '@prisma/client';
import { EmailDelivery } from '../../domain/email-delivery';
import {
  EmailDeliveryRepositoryPort,
  EmailDeliveryUpdate,
  NewEmailDelivery,
} from '../../application/ports/email-delivery.repository.port';
import { PrismaService } from './prisma.service';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaEmailDeliveryRepository
  implements EmailDeliveryRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async createOrGet(
    data: NewEmailDelivery,
  ): Promise<{ delivery: EmailDelivery; created: boolean }> {
    try {
      const row = await this.prisma.emailDelivery.create({
        data: { ...data, params: data.params as Prisma.InputJsonObject },
      });
      return { delivery: toDomain(row), created: true };
    } catch (error: unknown) {
      if (!data.idempotencyKey || !isUniqueViolation(error)) throw error;

      const existing = await this.prisma.emailDelivery.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (!existing) throw error;
      return { delivery: toDomain(existing), created: false };
    }
  }

  async update(id: string, data: EmailDeliveryUpdate): Promise<EmailDelivery> {
    const { params, ...rest } = data;
    const row = await this.prisma.emailDelivery.update({
      where: { id },
      data: {
        ...rest,
        ...(params === undefined
          ? {}
          : {
              params:
                params === null
                  ? Prisma.DbNull
                  : (params as Prisma.InputJsonObject),
            }),
      },
    });
    return toDomain(row);
  }

  async findDue(now: Date, limit: number): Promise<EmailDelivery[]> {
    const rows = await this.prisma.emailDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async claim(
    delivery: Pick<EmailDelivery, 'id' | 'nextAttemptAt'>,
    leaseUntil: Date,
  ): Promise<boolean> {
    // Only succeeds if nobody moved next_attempt_at since the row was read
    const { count } = await this.prisma.emailDelivery.updateMany({
      where: {
        id: delivery.id,
        status: 'PENDING',
        nextAttemptAt: delivery.nextAttemptAt,
      },
      data: { nextAttemptAt: leaseUntil },
    });
    return count === 1;
  }

  async findByIdsOrKeys(
    ids: string[],
    idempotencyKeys: string[],
  ): Promise<EmailDelivery[]> {
    const rows = await this.prisma.emailDelivery.findMany({
      where: {
        OR: [{ id: { in: ids } }, { idempotencyKey: { in: idempotencyKeys } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

function toDomain(row: EmailDeliveryRow): EmailDelivery {
  return {
    ...row,
    params: (row.params as Record<string, unknown> | null) ?? null,
  };
}
