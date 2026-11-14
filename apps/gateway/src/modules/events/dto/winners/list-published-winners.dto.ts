import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  DEFAULT_PUBLISHED_WINNERS_LIMIT,
  MAX_PUBLISHED_WINNERS_LIMIT,
} from '@app/common/constants/published-winners';

export class ListPublishedWinnersDTO {
  @ApiProperty({
    description: 'Page number (events per page, newest first)',
    example: 1,
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: `Events per page (max ${MAX_PUBLISHED_WINNERS_LIMIT})`,
    example: DEFAULT_PUBLISHED_WINNERS_LIMIT,
    required: false,
    default: DEFAULT_PUBLISHED_WINNERS_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PUBLISHED_WINNERS_LIMIT)
  @Type(() => Number)
  limit?: number = DEFAULT_PUBLISHED_WINNERS_LIMIT;
}

export interface PublishedWinnerItem {
  winnerId: number;
  projectId: number;
  /** null when project-service no longer has the project (deleted) */
  projectName: string | null;
  /** null unless the event ranking shows grades */
  grade: number | null;
}

export interface PublishedAwardItem {
  awardId: number;
  title: string;
  position: number;
  coWinners: boolean;
  winners: PublishedWinnerItem[];
}

export interface PublishedCategoryItem {
  categoryId: number;
  name: string;
  awards: PublishedAwardItem[];
}

export interface PublishedEventWinnersItem {
  eventId: number;
  name: string;
  startDate: string;
  endDate: string;
  categories: PublishedCategoryItem[];
}

export interface ListPublishedWinnersResult {
  events: PublishedEventWinnersItem[];
  meta: {
    total: number;
    itemsOnCurrentPage: number;
    itemsPerPage: number;
    currentPage: number;
    totalPages: number;
  };
}
