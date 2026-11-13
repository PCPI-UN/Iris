import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PUBLISHED_WINNERS_LIMIT = 50;

export class ListPublishedWinnersDTO {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PUBLISHED_WINNERS_LIMIT)
  limit?: number;
}
