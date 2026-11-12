/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async ports */
import { GradingScale, GradingScaleInput, SystemScaleCode } from '../domain/grading-scale';
import { EventScaleAssignment, GradingScaleRepositoryPort } from '../domain/grading-scale.repository.port';
import { EventGradingScaleResolver } from '../application/event-grading-scale.resolver';
import { EventDirectoryPort, EventsPage } from '../infrastructure/event-directory';

const LABELS = ['Insuficiente', 'Aceptable', 'Bueno', 'Excelente'];

function scale(id: number, name: string, code: string | null, points: number[], isSystem = true): GradingScale {
    return {
        id,
        name,
        description: null,
        isSystem,
        code,
        createdByUserId: null,
        createdAt: new Date('2026-11-12T00:00:00Z'),
        levels: points.map((value, index) => ({ level: index + 1, label: LABELS[index], points: value })),
    };
}

/** The system scales seeded by the migration. */
export function systemScales(): GradingScale[] {
    return [
        scale(1, 'Proyectos finales', SystemScaleCode.FINAL_PROJECTS, [25, 55, 75, 90]),
        scale(2, 'Cero a cinco', SystemScaleCode.ZERO_TO_FIVE, [2, 3, 4, 5]),
        scale(3, 'Cero a cien', SystemScaleCode.ZERO_TO_HUNDRED, [40, 60, 80, 100]),
    ];
}

export function customScale(id: number, points: number[], name = 'Custom'): GradingScale {
    return scale(id, name, null, points, false);
}

/** In-memory repository seeded with the system scales; evaluated events are set by the test. */
export class InMemoryGradingScaleRepository implements GradingScaleRepositoryPort {
    readonly scales = new Map<number, GradingScale>();
    readonly eventScales = new Map<number, number>();
    readonly evaluatedEvents = new Set<number>();
    private nextId = 100;

    constructor(scales: GradingScale[] = systemScales()) {
        scales.forEach((item) => this.scales.set(item.id, item));
    }

    async create(input: GradingScaleInput, createdByUserId: number | null): Promise<GradingScale> {
        const created: GradingScale = {
            id: this.nextId++,
            name: input.name,
            description: input.description ?? null,
            isSystem: false,
            code: null,
            createdByUserId,
            createdAt: new Date(),
            levels: input.levels.map((level) => ({ ...level })),
        };
        this.scales.set(created.id, created);
        return created;
    }

    async findAll(): Promise<GradingScale[]> {
        return [...this.scales.values()];
    }

    async findById(id: number): Promise<GradingScale | null> {
        return this.scales.get(id) ?? null;
    }

    async findByCode(code: string): Promise<GradingScale | null> {
        return [...this.scales.values()].find((item) => item.code === code) ?? null;
    }

    async update(id: number, input: GradingScaleInput): Promise<GradingScale> {
        const updated = { ...this.scales.get(id)!, name: input.name, description: input.description ?? null, levels: input.levels };
        this.scales.set(id, updated);
        return updated;
    }

    async delete(id: number): Promise<void> {
        this.scales.delete(id);
    }

    async findEventScale(eventId: number): Promise<GradingScale | null> {
        const scaleId = this.eventScales.get(eventId);
        return scaleId === undefined ? null : (this.scales.get(scaleId) ?? null);
    }

    async assignToEvent(eventId: number, scaleId: number): Promise<void> {
        this.eventScales.set(eventId, scaleId);
    }

    async assignIfMissing(assignments: EventScaleAssignment[]): Promise<number> {
        let inserted = 0;
        for (const { eventId, scaleId } of assignments) {
            if (!this.eventScales.has(eventId)) {
                this.eventScales.set(eventId, scaleId);
                inserted++;
            }
        }
        return inserted;
    }

    async findEventIdsByScale(scaleId: number): Promise<number[]> {
        return [...this.eventScales.entries()]
            .filter(([, id]) => id === scaleId)
            .map(([eventId]) => eventId)
            .sort((a, b) => a - b);
    }

    async findEventsWithEvaluations(eventIds: number[]): Promise<number[]> {
        return eventIds.filter((eventId) => this.evaluatedEvents.has(eventId));
    }

    async findLockedScaleIds(): Promise<Set<number>> {
        return new Set(
            [...this.eventScales.entries()]
                .filter(([eventId]) => this.evaluatedEvents.has(eventId))
                .map(([, scaleId]) => scaleId),
        );
    }
}

/** Event directory backed by a function, usually a jest mock of `getEvent`. */
export function eventDirectory(
    getEvent: (eventId: number) => Promise<{ id: number; evaluationType?: unknown } | null>,
    pages: EventsPage[] = [],
): EventDirectoryPort {
    return {
        getEvent: getEvent as EventDirectoryPort['getEvent'],
        listEvents: async (page: number) => pages[page - 1] ?? { events: [], totalPages: pages.length },
    };
}

export function buildResolver(
    repository: GradingScaleRepositoryPort,
    getEvent: (eventId: number) => Promise<{ id: number; evaluationType?: unknown } | null> = async () => null,
): EventGradingScaleResolver {
    return new EventGradingScaleResolver(repository, eventDirectory(getEvent));
}
