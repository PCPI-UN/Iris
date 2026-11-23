import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListMyEventsWithRolesDTO {
  @ApiProperty({
    description:
      'current: events that have not ended (endDate >= now), by startDate ascending. past: events that already ended, by endDate descending.',
    enum: ['current', 'past'],
    example: 'current',
  })
  @IsIn(['current', 'past'])
  status: 'current' | 'past';

  @ApiProperty({
    description: 'Page number for pagination',
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
    description: 'Number of items per page for pagination',
    example: 10,
    required: false,
    default: 10,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}
