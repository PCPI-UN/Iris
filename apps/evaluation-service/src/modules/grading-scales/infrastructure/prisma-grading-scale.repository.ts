import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GradingScale, GradingScaleInput } from '../domain/grading-scale';
import { EventScaleAssignment, GradingScaleRepositoryPort } from '../domain/grading-scale.repository.port';

const withLevels = { levels: { orderBy: { level: 'asc' } } } satisfies Prisma.GradingScaleInclude;

type GradingScaleRow = Prisma.GradingScaleGetPayload<{ include: typeof withLevels }>;

function toDomain(row: GradingScaleRow): GradingScale {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        isSystem: row.isSystem,
        code: row.code,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        levels: row.levels.map((level) => ({
            level: level.level,
            label: level.label,
            points: Number(level.points),
        })),
    };
}

@Injectable()
export class PrismaGradingScaleRepository implements GradingScaleRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async create(input: GradingScaleInput, createdByUserId: number | null): Promise<GradingScale> {
        const row = await this.prisma.db.gradingScale.create({
            data: {
                name: input.name,
                description: input.description ?? null,
                createdByUserId,
                levels: { create: input.levels.map(({ level, label, points }) => ({ level, label, points })) },
            },
            include: withLevels,
        });
        return toDomain(row);
    }

    async findAll(): Promise<GradingScale[]> {
        const rows = await this.prisma.db.gradingScale.findMany({
            include: withLevels,
            orderBy: [{ isSystem: 'desc' }, { id: 'asc' }],
        });
        return rows.map(toDomain);
    }

    async findById(id: number): Promise<GradingScale | null> {
        const row = await this.prisma.db.gradingScale.findUnique({ where: { id }, include: withLevels });
        return row ? toDomain(row) : null;
    }

    async findByCode(code: string): Promise<GradingScale | null> {
        const row = await this.prisma.db.gradingScale.findUnique({ where: { code }, include: withLevels });
        return row ? toDomain(row) : null;
    }

    async update(id: number, input: GradingScaleInput): Promise<GradingScale> {
        // Old levels are removed first: the new points may swap places with the old ones,
        // which would break the (scale_id, points) unique key if they were updated one by one.
        await this.prisma.db.gradingScaleLevel.deleteMany({ where: { scaleId: id } });
        const row = await this.prisma.db.gradingScale.update({
            where: { id },
            data: {
                name: input.name,
                description: input.description ?? null,
                levels: { create: input.levels.map(({ level, label, points }) => ({ level, label, points })) },
            },
            include: withLevels,
        });
        return toDomain(row);
    }

    async delete(id: number): Promise<void> {
        await this.prisma.db.gradingScale.delete({ where: { id } });
    }

    async findEventScale(eventId: number): Promise<GradingScale | null> {
        const row = await this.prisma.db.eventGradingScale.findUnique({
            where: { eventId },
            include: { scale: { include: withLevels } },
        });
        return row ? toDomain(row.scale) : null;
    }

    async assignToEvent(eventId: number, scaleId: number): Promise<void> {
        await this.prisma.db.eventGradingScale.upsert({
            where: { eventId },
            create: { eventId, scaleId },
            update: { scaleId, assignedAt: new Date() },
        });
    }

    async unassignEvent(eventId: number): Promise<boolean> {
        const result = await this.prisma.db.eventGradingScale.deleteMany({ where: { eventId } });
        return result.count > 0;
    }

    async assignIfMissing(assignments: EventScaleAssignment[]): Promise<number> {
        if (assignments.length === 0) {
            return 0;
        }
        const result = await this.prisma.db.eventGradingScale.createMany({
            data: assignments,
            skipDuplicates: true,
        });
        return result.count;
    }

    async findEventIdsByScale(scaleId: number): Promise<number[]> {
        const rows = await this.prisma.db.eventGradingScale.findMany({
            where: { scaleId },
            select: { eventId: true },
            orderBy: { eventId: 'asc' },
        });
        return rows.map((row) => row.eventId);
    }

    async findEventsWithEvaluations(eventIds: number[]): Promise<number[]> {
        if (eventIds.length === 0) {
            return [];
        }
        const rows = await this.prisma.db.evaluation.findMany({
            where: { memberEventId: { in: eventIds } },
            distinct: ['memberEventId'],
            select: { memberEventId: true },
            orderBy: { memberEventId: 'asc' },
        });
        return rows.map((row) => row.memberEventId);
    }

    async findLockedScaleIds(): Promise<Set<number>> {
        const rows = await this.prisma.db.$queryRaw<Array<{ scale_id: number }>>`
            SELECT DISTINCT egs.scale_id
            FROM event_grading_scale egs
            WHERE EXISTS (SELECT 1 FROM evaluations e WHERE e.member_event_id = egs.event_id)`;
        return new Set(rows.map((row) => Number(row.scale_id)));
    }
}
