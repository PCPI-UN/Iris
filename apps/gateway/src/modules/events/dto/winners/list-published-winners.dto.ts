import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
    description: 'Events per page (max 50)',
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}

export interface PublishedWinnerItem {
  winnerId: number;
  projectId: number;
  /** null when the project can no longer be read */
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
