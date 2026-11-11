/**
 * An award won by a project, with the award, category and event it belongs to.
 * Co-winners of the same award are one ProjectAward each.
 */
export class ProjectAward {
  constructor(
    public readonly winnerId: number,
    public readonly projectId: number,
    public readonly awardId: number,
    public readonly title: string,
    public readonly position: number,
    public readonly categoryId: number,
    public readonly categoryName: string,
    public readonly eventId: number,
  ) {}
}
