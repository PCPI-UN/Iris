export abstract class ProjectServicePort {
    /**
     * Category (course) of each of the given projects, by project id. Projects that no longer
     * exist are left out of the map.
     */
    abstract getProjectCategories(projectIds: number[]): Promise<Map<number, number>>;
}
