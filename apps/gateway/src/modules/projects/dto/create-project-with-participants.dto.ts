import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  IsNumberString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PendingParticipantInputDto } from './pending-participant-input.dto';
import { ProjectDocumentWithUrlDto } from './project-document-input.dto';

/**
 * Internal DTO for creating a project with participants
 * This is used internally after files have been uploaded and URLs obtained
 */
export class CreateProjectWithParticipantsDto {
  @ApiProperty({
    description: 'Event ID to which this project belongs',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  eventId: number;

  @ApiProperty({
    description: 'Event type for the project',
    example: 'Competition',
  })
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @ApiProperty({
    description: 'Course ID associated with this project',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  courseId: number;

  @ApiProperty({
    description:
      'NRC of the course section of the project, looked up in the academic term of the event. ' +
      'Required when the event requires a course section (requiresCourse); ignored otherwise',
    example: '1001',
    maxLength: 20,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nrc?: string;

  @ApiProperty({
    description: 'Name of the project',
    example: 'Smart Home Automation System',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Código opcional del proyecto',
    required: false,
    example: '202301',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsNumberString()
  @MaxLength(50)
  projectCode?: string;

  @ApiProperty({
    description: 'Detailed description of the project',
    example: 'An IoT-based system for automating home appliances using Arduino and mobile app',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'List of participants/team members for the project',
    type: [PendingParticipantInputDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PendingParticipantInputDto)
  @IsOptional()
  participants?: PendingParticipantInputDto[];

  @ApiProperty({
    description: 'List of documents associated with the project (poster, supporting documents) with URLs',
    type: [ProjectDocumentWithUrlDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDocumentWithUrlDto)
  @IsOptional()
  documents?: ProjectDocumentWithUrlDto[];
}
