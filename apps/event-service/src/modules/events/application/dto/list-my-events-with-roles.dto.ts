import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';

export class ListMyEventsWithRolesDto {
  @IsInt()
  @Min(1)
  userId: number;

  @IsIn(['current', 'past'])
  status: 'current' | 'past';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
