import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class GetRubricReadinessDto {
  @IsInt()
  @IsNotEmpty()
  eventId: number;

  @IsInt()
  @IsOptional()
  courseId?: number;
}
