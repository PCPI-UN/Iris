import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { EventRepository } from '../../domain/repositories/event.repository';
import { Event as DomainEvent } from '../../domain/entities/event.entity';
import { EvaluationType, EventStatus, EventType } from '@app/common/generated/event';

type PrismaEvent = any;

function toProtoEventType(value: string | null | undefined): EventType {
  switch (value) {
    case 'Exposition':
      return EventType.EXPO;
    case 'Competition':
      return EventType.COMPETENCIA;
    default:
      return EventType.EVENT_TYPE_UNSPECIFIED;
  }
}

function toPrismaEventType(value: EventType | undefined): 'Exposition' | 'Competition' {
  switch (value) {
    case EventType.COMPETENCIA:
      return 'Competition';
    case EventType.EXPO:
    case EventType.EVENT_TYPE_UNSPECIFIED:
    default:
      return 'Exposition';
  }
}

function toProtoEvaluationType(value: string | null | undefined): EvaluationType {
  switch (value) {
    case 'FINAL_PROJECTS':
      return EvaluationType.FINAL_PROJECTS;
    case 'ZERO_TO_FIVE':
      return EvaluationType.ZERO_TO_FIVE;
    case 'ZERO_TO_HUNDRED':
      return EvaluationType.ZERO_TO_HUNDRED;
    default:
      return EvaluationType.FINAL_PROJECTS;
  }
}

function toPrismaEvaluationType(
  value: EvaluationType | undefined,
): 'FINAL_PROJECTS' | 'ZERO_TO_FIVE' | 'ZERO_TO_HUNDRED' | undefined {
  switch (value) {
    case EvaluationType.FINAL_PROJECTS:
      return 'FINAL_PROJECTS';
    case EvaluationType.ZERO_TO_FIVE:
      return 'ZERO_TO_FIVE';
    case EvaluationType.ZERO_TO_HUNDRED:
      return 'ZERO_TO_HUNDRED';
    case EvaluationType.EVALUATION_TYPE_UNSPECIFIED:
    default:
      return undefined;
  }
}

function toDomainEvent(p: any): DomainEvent {
  if (!p) {
    throw new Error('toDomainEvent called with null/undefined');
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    accessCode: p.accessCode,
    isPubliclyJoinable: p.isPubliclyJoinable,
    inscriptionDeadline: p.inscriptionDeadline,
    inscriptionCost: p.inscriptionCost ?? null,
    evaluationsOpened: p.evaluationsOpened,
    resultsPublished: p.resultsPublished ?? false,
    startDate: p.startDate,
    endDate: p.endDate,
    active: p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdByUserId: p.createdByUserId,
    location: p.location,
    locationDetails: p.locationDetails ?? null,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    evaluationType: toProtoEvaluationType(p.evaluationType),
    inscriptionRequirements: p.inscriptionRequirements ?? null,
    minimumTeamSize: p.minimumTeamSize ?? null,
    aboutOurAllies: p.aboutOurAllies ?? null,
    eventType: toProtoEventType(p.eventType),
    collaborators: p.collaborators ?? [],
    organizers: p.organizers ?? [],
  };
}

@Injectable()
export class PrismaEventRepository extends EventRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private buildStatusCondition(status: EventStatus, now: Date) {
    if (status === EventStatus.UPCOMING) {
      return {
        AND: [
          { startDate: { gt: now } },
          { inscriptionDeadline: { gt: now } },
        ],
      };
    }

    if (status === EventStatus.REGISTRATION_CLOSED) {
      return {
        AND: [
          { inscriptionDeadline: { lte: now } },
          { startDate: { gt: now } },
        ],
      };
    }

    if (status === EventStatus.AVAILABLE) {
      return {
        AND: [
          { startDate: { lte: now } },
          { endDate: { gte: now } },
        ],
      };
    }

    if (status === EventStatus.CLOSED) {
      return {
        endDate: { lt: now },
      };
    }

    return undefined;
  }

  private buildWhere(where?: { q?: string; onlyActive?: boolean; statuses?: EventStatus[] }) {
    const filters: any = {};
    if (where?.onlyActive) filters.active = true;
    if (where?.q?.trim()) {
      filters.OR = [
        { name: { contains: where.q, mode: 'insensitive' } },
        { description: { contains: where.q, mode: 'insensitive' } },
      ];
    }

    const statuses = where?.statuses?.filter(
      (status) => status !== undefined && status !== EventStatus.UNSPECIFIED,
    );

    if (statuses?.length) {
      const now = new Date();
      const statusConditions = statuses
        .map((status) => this.buildStatusCondition(status, now))
        .filter(Boolean);

      if (statusConditions.length) {
        filters.AND = [...(filters.AND ?? []), { OR: statusConditions }];
      }
    }

    return filters;
  }

  /** Calcula EventStatus (enum numérico del proto) con base en fechas */
  private computeStatus(e: PrismaEvent): number {
    const now = new Date();
    const start = e?.startDate ? new Date(e.startDate) : undefined;
    const end = e?.endDate ? new Date(e.endDate) : undefined;
    const inscriptionDeadline = e?.inscriptionDeadline
      ? new Date(e.inscriptionDeadline)
      : undefined;

    if (end && now > end) return EventStatus.CLOSED;
    if (start && now >= start && (!end || now <= end)) return EventStatus.AVAILABLE;
    if (inscriptionDeadline && start && now >= inscriptionDeadline && now < start) {
      return EventStatus.REGISTRATION_CLOSED;
    }
    return EventStatus.UPCOMING;
  }

  // ==========================
  //  CRUD BÁSICO
  // ==========================

  async create(input: any) {
    const data = {
      name: input.name,
      description: input.description ?? null,
      accessCode: input.accessCode,
      isPubliclyJoinable: input.isPubliclyJoinable ?? false,
      inscriptionDeadline: input.inscriptionDeadline,
      inscriptionCost: input.inscriptionCost ?? null,
      evaluationsOpened: input.evaluationsOpened ?? false,
      startDate: input.startDate,
      endDate: input.endDate,
      location: input.location,
      locationDetails: input.locationDetails ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      evaluationType: toPrismaEvaluationType(input.evaluationType),
      inscriptionRequirements: input.inscriptionRequirements ?? null,
      minimumTeamSize: input.minimumTeamSize ?? null,
      aboutOurAllies: input.aboutOurAllies ?? null,
      eventType: toPrismaEventType(input.eventType),
      collaborators: input.collaborators ?? [],
      organizers: input.organizers ?? [],
      active: input.active ?? true,
      createdByUserId: input.createdByUserId ?? 0,
    };

    const created = await this.prisma.event.create({ data });
    return toDomainEvent(created);
  }

  async findById(id: number): Promise<DomainEvent | null> {
    const row = await this.prisma.event.findUnique({
      where: { id },
    });

    if (!row) return null;

    return toDomainEvent(row);
  }

  async findByIds(ids: number[]): Promise<DomainEvent[]> {
    if (!ids.length) return [];

    const rows = await this.prisma.event.findMany({
      where: { id: { in: ids } },
    });

    return rows.map(toDomainEvent);
  }

  async findByAccessCode(accessCode: string): Promise<DomainEvent | null> {
    const row = await this.prisma.event.findUnique({
      where: { accessCode },
    });

    if (!row) return null;

    return toDomainEvent(row);
  }

  async findAll() {
    const rows = await this.prisma.event.findMany({
      orderBy: { id: 'asc' },
    });
    return rows.map(toDomainEvent);
  }

  async update(id: number, input: any) {
    const data = {
      name: input.name,
      description: input.description !== undefined ? input.description : undefined,
      accessCode: input.accessCode,
      isPubliclyJoinable: input.isPubliclyJoinable,
      inscriptionDeadline: input.inscriptionDeadline,
      inscriptionCost: input.inscriptionCost,
      evaluationsOpened: input.evaluationsOpened,
      resultsPublished: input.resultsPublished,
      startDate: input.startDate,
      endDate: input.endDate,
      location: input.location,
      locationDetails: input.locationDetails,
      latitude: input.latitude,
      longitude: input.longitude,
      evaluationType:
        input.evaluationType !== undefined
          ? toPrismaEvaluationType(input.evaluationType)
          : undefined,
      inscriptionRequirements:
        input.inscriptionRequirements !== undefined
          ? input.inscriptionRequirements
          : undefined,
      minimumTeamSize:
        input.minimumTeamSize !== undefined ? input.minimumTeamSize : undefined,
      aboutOurAllies:
        input.aboutOurAllies !== undefined ? input.aboutOurAllies : undefined,
      eventType: input.eventType !== undefined ? toPrismaEventType(input.eventType) : undefined,
      collaborators: input.collaborators,
      organizers: input.organizers,
      active: input.active,
    };

    const updated = await this.prisma.event.update({
      where: { id },
      data,
    });
    return toDomainEvent(updated);
  }

  async delete(id: number) {
    // Soft delete: set active = false instead of deleting
    await this.prisma.event.update({
      where: { id },
      data: { active: false },
    });
  }

  // ==========================
  //  LISTADOS / PAGINACIÓN
  // ==========================

  async findPaginated(params: {
    page: number;
    limit: number;
    q?: string;
    onlyActive?: boolean;
    statuses?: EventStatus[];
  }): Promise<{ items: DomainEvent[]; total: number }> {
    const { page, limit, q, onlyActive, statuses } = params;

    const where = this.buildWhere({ q, onlyActive, statuses });
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({ where }),
    ]);

    const items = rows.map((row) => toDomainEvent(row));

    return {
      items,
      total,
    };
  }

  // 👉 SOLO EVENTOS DONDE EL USER ES MEMBER (StaffEventMember)
  async findPaginatedByMember(params: {
    page: number;
    limit: number;
    q?: string;
    onlyActive?: boolean;
    userId: number;
  }): Promise<{ items: DomainEvent[]; total: number }> {
    const { page, limit, q, onlyActive, userId } = params;

    const baseWhere = this.buildWhere({ q, onlyActive });
    const skip = (page - 1) * limit;

    // ==========================================================
    // 🔎 LOG 1: Ver todos los EventMembers del usuario
    // ==========================================================
    const userMemberships = await (this.prisma as any).staffEventMember.findMany({
      where: { userId },
    });

    console.log("🔎 [EventMember] Registros encontrados para userId:", userId);
    console.log(JSON.stringify(userMemberships, null, 2));

    // ==========================================================
    // 🔎 LOG 2: Ver el filtro completo que enviamos a Prisma
    // ==========================================================
    const where = {
      ...baseWhere,
      participants: {
        some: {
          userId: userId,
          active: true,
        },
      },
    };

    console.log("🧩 [QueryWhere] Filtro de búsqueda construido:");
    console.log(JSON.stringify(where, null, 2));

    // ==========================================================
    // 🔎 LOG 3: Ejecutar la query
    // ==========================================================
    const rows = await this.prisma.event.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    console.log("📦 [Eventos encontrados]:");
    console.log(JSON.stringify(rows.map(r => ({ id: r.id, name: r.name })), null, 2));

    const total = await this.prisma.event.count({ where });

    // ==========================================================
    // 🔎 LOG 4: Mostrar el total
    // ==========================================================
    console.log(`📊 [Total]: ${total} eventos permitidos para userId ${userId}`);

    // ==========================================================
    // FIN LOGS - Mapear a Domain
    // ==========================================================
    const items = rows.map(toDomainEvent);

    return {
      items,
      total,
    };
  }

  // 👉 LIST MY EVENTS - Platform staff sees all, regular users see only their events with role info
  async findMyEvents(params: {
    userId: number;
    page: number;
    limit: number;
    isPlatformStaff: boolean;
  }): Promise<{
    events: Array<DomainEvent & { userEventRoleId?: number }>;
    total: number;
  }> {
    const { userId, page, limit, isPlatformStaff } = params;
    const skip = (page - 1) * limit;

    if (isPlatformStaff) {
      // Platform staff: return all events without role filtering
      const [events, total] = await Promise.all([
        this.prisma.event.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.event.count(),
      ]);

      return {
        events: events.map(toDomainEvent),
        total,
      };
    } else {
      // Regular user: return only events where user is a member, include roleId
      const [events, total] = await Promise.all([
        this.prisma.event.findMany({
          where: {
            participants: {
              some: {
                userId: userId,
                active: true,
              },
            },
          },
          include: {
            participants: {
              where: { userId, active: true },
              take: 1, // Only get the user's own membership
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.event.count({
          where: {
            participants: {
              some: { userId, active: true },
            },
          },
        }),
      ]);

      // Map events and include user's roleId for each event
      const eventsWithRole = events.map((event) => ({
        ...toDomainEvent(event),
        userEventRoleId: event.participants[0]?.roleId,
      }));

      return {
        events: eventsWithRole,
        total,
      };
    }
  }

  async countActive(): Promise<number> {
    return this.prisma.event.count({
      where: { active: true },
    });
  }

  async findActiveWithCoordinates(): Promise<DomainEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        active: true,
        latitude:  { not: null },
        longitude: { not: null },
      },
      orderBy: { startDate: 'asc' },
    });
    return rows.map(toDomainEvent);
  }


}
