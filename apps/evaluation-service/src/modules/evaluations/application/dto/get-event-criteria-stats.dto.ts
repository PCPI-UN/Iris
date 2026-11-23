import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
} from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  withCriteria?: boolean;
}
