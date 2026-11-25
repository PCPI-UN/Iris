import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class GetProjectResultDto {
  @IsInt()
  @Min(1)
  projectId: number;

  /** Adds each juror's evaluation, without the juror; only for the academic roles */
  @IsOptional()
  @IsBoolean()
  withEvaluations?: boolean;
}
