import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PUBLISHED_WINNERS_LIMIT } from '@app/common/constants/published-winners';

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
