import { GradingScale, GradingScaleInput } from './grading-scale';

export interface EventScaleAssignment {
    eventId: number;
    scaleId: number;
}

export abstract class GradingScaleRepositoryPort {
    abstract create(input: GradingScaleInput, createdByUserId: number | null): Promise<GradingScale>;
    abstract findAll(): Promise<GradingScale[]>;
    abstract findById(id: number): Promise<GradingScale | null>;
    abstract findByCode(code: string): Promise<GradingScale | null>;
    /** Replaces the name, description and levels of a scale. */
    abstract update(id: number, input: GradingScaleInput): Promise<GradingScale>;
    abstract delete(id: number): Promise<void>;

    /** Scale assigned to the event, or `null` when the event has no row yet. */
    abstract findEventScale(eventId: number): Promise<GradingScale | null>;
    /** Assigns the scale to the event, replacing the previous assignment. */
    abstract assignToEvent(eventId: number, scaleId: number): Promise<void>;
    /** Inserts the assignments whose event has none yet and returns how many were inserted. */
    abstract assignIfMissing(assignments: EventScaleAssignment[]): Promise<number>;
    /** Events that use the scale. */
    abstract findEventIdsByScale(scaleId: number): Promise<number[]>;
    /** Events that already have at least one evaluation, among the given ones. */
    abstract findEventsWithEvaluations(eventIds: number[]): Promise<number[]>;
    /** Scales used by at least one event that has evaluations; they cannot be edited or deleted. */
    abstract findLockedScaleIds(): Promise<Set<number>>;
}
