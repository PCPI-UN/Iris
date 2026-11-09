import { EventProto } from '@app/common/generated/event';

export abstract class EventServicePort {
    abstract getEvent(eventId: number): Promise<EventProto>;
    /** Active categories (courses) of an event. */
    abstract listCourseIdsByEvent(eventId: number): Promise<number[]>;
    abstract validateCoursesBelongToEvent(
        courseIds: number[],
        eventId: number
    ): Promise<{ valid: boolean; invalidCourses: number[] }>;
}
