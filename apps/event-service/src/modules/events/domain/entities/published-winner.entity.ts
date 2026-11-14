/**
 * An event whose ranking is published and that has winners in active categories.
 * `gradeVisible` mirrors ranking_event.grade_visible: grades are shown only when true.
 */
export class PublishedWinnersEvent {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly startDate: Date,
    public readonly endDate: Date,
    public readonly gradeVisible: boolean,
  ) {}
}

/**
 * One winner of an award, with the award and category it belongs to. Co-winners of the
 * same award are one PublishedWinner each.
 */
export class PublishedWinner {
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

export interface PublishedWinnersEventsPage {
  events: PublishedWinnersEvent[];
  total: number;
}

/** Winners view of one event: event → category → award → winners. */
export interface EventWinners {
  eventId: number;
  name: string;
  startDate: Date;
  endDate: Date;
  categories: CategoryWinners[];
}

export interface CategoryWinners {
  categoryId: number;
  name: string;
  awards: AwardWinners[];
}

export interface AwardWinners {
  awardId: number;
  title: string;
  position: number;
  coWinners: boolean;
  winners: WinnerEntry[];
}

export interface WinnerEntry {
  winnerId: number;
  projectId: number;
  /** null unless the event ranking shows grades */
  grade: number | null;
}
