import { IsInt, Min } from 'class-validator';

export class GetProjectResultDto {
  @IsInt()
  @Min(1)
  projectId: number;
}
