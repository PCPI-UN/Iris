/**
 * Response of ListPublishedWinnersUC: a page of events, each with its categories, awards
 * and winners.
 */
export interface WinnersPage {
  events: WinnersPageEvent[];
  total: number;
  page: number;
  limit: number;
}

export interface WinnersPageEvent {
  eventId: number;
  name: string;
  startDate: Date;
  endDate: Date;
  categories: WinnersPageCategory[];
}

export interface WinnersPageCategory {
  categoryId: number;
  name: string;
  awards: WinnersPageAward[];
}

export interface WinnersPageAward {
  awardId: number;
  title: string;
  position: number;
  coWinners: boolean;
  winners: WinnersPageWinner[];
}

export interface WinnersPageWinner {
  winnerId: number;
  projectId: number;
  /** null unless the event ranking shows grades */
  grade: number | null;
}
