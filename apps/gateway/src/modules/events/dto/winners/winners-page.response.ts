import { ApiProperty } from '@nestjs/swagger';

/**
 * Response of GET /events/public/winners: a page of events, each with its categories,
 * awards and winners.
 */

export class WinnersPageWinner {
  @ApiProperty({ example: 41 })
  winnerId: number;

  @ApiProperty({ example: 120 })
  projectId: number;

  @ApiProperty({
    example: 'Robot clasificador de residuos',
    nullable: true,
    type: String,
    description: 'null when project-service no longer has the project',
  })
  projectName: string | null;

  @ApiProperty({
    example: 92.5,
    nullable: true,
    type: Number,
    description: 'null unless the event ranking shows grades',
  })
  grade: number | null;
}

export class WinnersPageAward {
  @ApiProperty({ example: 11 })
  awardId: number;

  @ApiProperty({ example: 'Primer lugar' })
  title: string;

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({
    example: false,
    description: 'true when the award has more than one winner',
  })
  coWinners: boolean;

  @ApiProperty({ type: [WinnersPageWinner] })
  winners: WinnersPageWinner[];
}

export class WinnersPageCategory {
  @ApiProperty({ example: 7 })
  categoryId: number;

  @ApiProperty({ example: 'Software' })
  name: string;

  @ApiProperty({ type: [WinnersPageAward] })
  awards: WinnersPageAward[];
}

export class WinnersPageEvent {
  @ApiProperty({ example: 9 })
  eventId: number;

  @ApiProperty({ example: 'Feria de proyectos 2026-2' })
  name: string;

  @ApiProperty({ example: '2026-10-01T13:00:00.000Z' })
  startDate: string;

  @ApiProperty({ example: '2026-10-03T22:00:00.000Z' })
  endDate: string;

  @ApiProperty({ type: [WinnersPageCategory] })
  categories: WinnersPageCategory[];
}

export class WinnersPageMeta {
  @ApiProperty({ example: 12, description: 'Events with published winners' })
  total: number;

  @ApiProperty({ example: 10 })
  itemsOnCurrentPage: number;

  @ApiProperty({ example: 10 })
  itemsPerPage: number;

  @ApiProperty({ example: 1 })
  currentPage: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

export class WinnersPageResponse {
  @ApiProperty({
    type: [WinnersPageEvent],
    description: 'Newest event first',
  })
  events: WinnersPageEvent[];

  @ApiProperty({ type: WinnersPageMeta })
  meta: WinnersPageMeta;
}
