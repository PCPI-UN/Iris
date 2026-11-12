import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { GradingScaleRepositoryPort } from '../domain/grading-scale.repository.port';
import { systemScaleCodeFor } from '../domain/legacy-evaluation-type';
import { EventDirectoryPort } from '../infrastructure/event-directory';

const PAGE_SIZE = 100;
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 15_000;

/**
 * Gives every existing event the system scale of its deprecated `evaluationType`. The events live
 * in event-service's database, so the migration cannot do it: this runs once at startup, in the
 * background, and only inserts the events that have no scale yet. Until it finishes,
 * `EventGradingScaleResolver` assigns the same scale the first time an event is used.
 *
 * Set GRADING_SCALE_BACKFILL=false to turn it off.
 */
@Injectable()
export class GradingScaleBackfillService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(GradingScaleBackfillService.name);
    private timer: NodeJS.Timeout | null = null;
    private stopped = false;

    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly events: EventDirectoryPort,
    ) {}

    onApplicationBootstrap() {
        if (process.env.GRADING_SCALE_BACKFILL === 'false') {
            return;
        }
        this.schedule(1, 0);
    }

    onModuleDestroy() {
        this.stopped = true;
        if (this.timer) {
            clearTimeout(this.timer);
        }
    }

    private schedule(attempt: number, delayMs: number) {
        this.timer = setTimeout(() => void this.attempt(attempt), delayMs);
        this.timer.unref?.();
    }

    private async attempt(attempt: number) {
        if (this.stopped) {
            return;
        }
        try {
            const assigned = await this.run();
            this.logger.log(`Grading scale backfill finished: ${assigned} event(s) assigned`);
        } catch (error) {
            const message = (error as Error)?.message;
            if (attempt >= MAX_ATTEMPTS) {
                this.logger.warn(
                    `Grading scale backfill gave up after ${attempt} attempts (${message}); ` +
                    'events without a scale get one the first time they are used',
                );
                return;
            }
            this.logger.warn(`Grading scale backfill attempt ${attempt} failed (${message}); retrying`);
            this.schedule(attempt + 1, RETRY_DELAY_MS);
        }
    }

    /** Assigns the missing scales and returns how many events got one. */
    async run(): Promise<number> {
        const scaleIdByCode = new Map<string, number>();
        let assigned = 0;
        let page = 1;
        let totalPages = 1;

        do {
            const result = await this.events.listEvents(page, PAGE_SIZE);
            totalPages = result.totalPages;

            const assignments: Array<{ eventId: number; scaleId: number }> = [];
            for (const event of result.events) {
                const code = systemScaleCodeFor(event.evaluationType);
                if (!scaleIdByCode.has(code)) {
                    const scale = await this.repository.findByCode(code);
                    if (!scale) {
                        throw new Error(`system grading scale ${code} is missing`);
                    }
                    scaleIdByCode.set(code, scale.id);
                }
                assignments.push({ eventId: event.id, scaleId: scaleIdByCode.get(code)! });
            }

            assigned += await this.repository.assignIfMissing(assignments);
            page++;
        } while (page <= totalPages && !this.stopped);

        return assigned;
    }
}
