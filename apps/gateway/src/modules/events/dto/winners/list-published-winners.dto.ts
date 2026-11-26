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
