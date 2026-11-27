import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';

export class ProjectGroupDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  projectIds?: number[];
}

export class GetEventCriteriaStatsDto {
  @IsInt()
  @IsPositive()
  eventId: number;

  /** Empty when the event has no projects */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  projectIds?: number[];

  /** Optional subsets of projects, each averaged on its own */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectGroupDto)
  groups?: ProjectGroupDto[];
}
