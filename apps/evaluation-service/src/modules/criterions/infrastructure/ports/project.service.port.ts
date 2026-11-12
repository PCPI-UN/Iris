export abstract class ProjectServicePort {
    /** Category (course) of every project of an event, by project id. */
    abstract getProjectCategories(eventId: number): Promise<Map<number, number>>;
}
