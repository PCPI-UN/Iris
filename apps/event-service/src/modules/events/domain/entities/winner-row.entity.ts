/**
 * An event whose results are published, whose ranking is public and that has winners in
 * active categories. `gradeVisible` mirrors ranking_event.grade_visible: grades are shown
 * only when true.
 */
export class WinnersEventRow {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly startDate: Date,
    public readonly endDate: Date,
    public readonly gradeVisible: boolean,
  ) {}
}

/**
 * One award_winners row with the award and category it belongs to. Co-winners of the
 * same award are one WinnerRow each.
 */
export class WinnerRow {
  constructor(
    public readonly winnerId: number,
    public readonly projectId: number,
    public readonly grade: number,
    public readonly awardId: number,
    public readonly awardTitle: string,
    public readonly awardPosition: number,
    public readonly categoryId: number,
    public readonly categoryName: string,
    public readonly eventId: number,
  ) {}
}
