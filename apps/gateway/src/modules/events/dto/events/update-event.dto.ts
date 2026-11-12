import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { EvaluationType, EventType } from '@app/common/generated/event';
import {
  IsArray,
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  transformEvaluationType,
  transformEventType,
} from './event-type-transformer';

class UpdateEventCategoryDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  eventId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateEventAwardDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  position?: number;
}

class UpdateEventSpecificInscriptionDetailDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  eventId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  value?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class UpdateEventPayloadDTO {
  @ApiProperty({
    description: 'ID of the event to update',
    example: 123,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiProperty({
    description: 'New name of the event',
    example: 'Annual Science Fair',
    required: false,
    minLength: 3,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    description: 'New description of the event',
    example: 'An event showcasing scientific projects from students.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'New access code for the event',
    example: 'SCI2024',
    required: false,
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'accessCode must contain only alphanumeric characters and hyphens',
  })
  @MinLength(3)
  @MaxLength(50)
  accessCode?: string;

  @ApiProperty({
    description: 'Indicates if the event is publicly joinable',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPubliclyJoinable?: boolean;

  @ApiProperty({
    description: 'New deadline for event registration (ISO 8601 format)',
    example: '2024-11-30T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  inscriptionDeadline?: string;

  @ApiProperty({
    description: 'Indicates if evaluations are opened for the event',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  evaluationsOpened?: boolean;

  @ApiProperty({
    description: 'New start date of the event (ISO 8601 format)',
    example: '2024-05-01T09:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'New end date of the event (ISO 8601 format)',
    example: '2024-05-03T17:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Indicates if the event is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'New location of the event',
    example: 'Main Auditorium',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiProperty({
    description: 'Updated type of the event',
    enum: EventType,
    required: false,
    example: 'Competition',
  })
  @IsOptional()
  @Transform(transformEventType)
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiProperty({
    description: 'Updated inscription cost',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inscriptionCost?: number;

  @ApiProperty({
    description: 'Updated location details',
    required: false,
  })
  @IsOptional()
  @IsString()
  locationDetails?: string;

  @ApiProperty({
    description: 'Deprecated: use gradingScaleId. Kept for compatibility',
    deprecated: true,
    enum: EvaluationType,
    required: false,
    example: 'FINAL_PROJECTS',
  })
  @IsOptional()
  @Transform(transformEvaluationType)
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;

  @ApiProperty({
    description:
      'Grading scale of the event, from the catalog (GET /grading-scales). To use a new scale, create it first ' +
      'with POST /grading-scales. Without it, a new event gets "Proyectos finales" and an existing event keeps its scale.',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  gradingScaleId?: number;

  @ApiProperty({
    description: 'Updated inscription requirements',
    required: false,
  })
  @IsOptional()
  @IsString()
  inscriptionRequirements?: string;

  @ApiProperty({
    description: 'Updated minimum team size',
    required: false,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumTeamSize?: number;

  @ApiProperty({
    description: 'Updated information about allies or partners',
    required: false,
  })
  @IsOptional()
  @IsString()
  aboutOurAllies?: string;

  @ApiProperty({
    description: 'Updated collaborators',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collaborators?: string[];

  @ApiProperty({
    description: 'Updated organizers',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizers?: string[];

  @ApiProperty({
    description: 'Updated event categories',
    required: false,
    type: [UpdateEventCategoryDTO],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEventCategoryDTO)
  categories?: UpdateEventCategoryDTO[];

  @ApiProperty({
    description: 'Updated category awards',
    required: false,
    type: [UpdateEventAwardDTO],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEventAwardDTO)
  awards?: UpdateEventAwardDTO[];

  @ApiProperty({
    description: 'Updated specific inscription details',
    required: false,
    type: [UpdateEventSpecificInscriptionDetailDTO],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEventSpecificInscriptionDetailDTO)
  specificInscriptionDetails?: UpdateEventSpecificInscriptionDetailDTO[];

}

export class UpdateEventDTO extends UpdateEventPayloadDTO {
  @ApiProperty({
    description: 'Event payload wrapper accepted by the update endpoint',
    required: false,
    type: UpdateEventPayloadDTO,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEventPayloadDTO)
  event?: UpdateEventPayloadDTO;
}

