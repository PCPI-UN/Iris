import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProjectStateFilter } from '../../projects/dto/list-projects-by-event.dto';
import { AcademicProfile } from '../academic-profiles';

/** Every /academic read except /profiles is done as one of the caller's profiles */
export class AcademicProfileQueryDto {
  @ApiProperty({
    description:
      'Academic profile of the caller (one of GET /academic/profiles); the projects are ' +
      'limited to the scope of that profile only. 403 when the caller lacks its role',
    enum: AcademicProfile,
    example: AcademicProfile.PROFESSOR,
  })
  @IsEnum(AcademicProfile)
  profile!: AcademicProfile;
}

export class ListAcademicProjectsDto extends AcademicProfileQueryDto {
  @ApiPropertyOptional({ description: 'Only the projects of this event', example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  eventId?: number;

  @ApiPropertyOptional({ description: 'Review state of the project', enum: ProjectStateFilter })
  @IsOptional()
  @IsEnum(ProjectStateFilter)
  state?: ProjectStateFilter;

  @ApiPropertyOptional({ description: 'Only the projects of this course section (NRC)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  academicCourseId?: number;

  @ApiPropertyOptional({ description: 'Text search in the project name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  currentPage?: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  itemsPerPage?: number;
}

export class AcademicEventQueryDto extends AcademicProfileQueryDto {
  @ApiProperty({ description: 'Event whose projects are listed', example: 4 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  eventId!: number;
}

export enum AcademicGradesFormat {
  JSON = 'json',
  EXCEL = 'excel',
}

export class GetAcademicGradesDto extends AcademicEventQueryDto {
  @ApiPropertyOptional({
    description: 'json (default) returns the data; excel downloads the XLSX with the same data',
    enum: AcademicGradesFormat,
  })
  @IsOptional()
  @IsEnum(AcademicGradesFormat)
  format?: AcademicGradesFormat = AcademicGradesFormat.JSON;
}
