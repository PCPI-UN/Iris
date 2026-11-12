import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { EvaluationType, EventType } from '@app/common/generated/event';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  transformEvaluationType,
  transformEventType,
} from './event-type-transformer';

class CreateSpecificInscriptionDetailDTO {
  @ApiProperty({
    description: 'Title of the inscription detail',
    example: 'Documento de identidad',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Optional description for the inscription detail',
    example: 'Cada integrante debe adjuntar una copia.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Optional numeric value associated with the detail',
    example: 0,
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number = 0;

  @ApiProperty({
    description: 'Whether the detail is required',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean = true;
}

class CreateEventCategoryDTO {
  @ApiProperty({
    description: 'Name of the category to create with the event',
    example: 'General',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Optional description of the category',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Whether the category is active',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean = true;
}

class CreateNestedAwardDTO {
  @ApiProperty({
    description: 'Title of the award',
    example: 'Primer puesto',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Optional description of the award',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Optional numeric value of the award',
    required: false,
    example: 5000,
  })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiProperty({
    description: 'Position of the award',
    required: false,
    default: 0,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  position?: number = 0;
}

export class CreateEventDTO {
  @ApiProperty({
    description: 'Name of the event',
    example: 'Annual Tech Conference',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Detailed description of the event',
    example: 'A conference bringing together technology enthusiasts from around the world to discuss the latest trends in tech.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Access code required to join the event',
    example: 'TECH2024',
  })
  @IsString()
  @IsNotEmpty()
  accessCode: string;

  @ApiProperty({
    description: 'Indicates if the event is publicly joinable',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  isPubliclyJoinable: boolean = true;

  @ApiProperty({
    description: 'Deadline for event registration (ISO 8601 format)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsDateString()
  @IsNotEmpty()
  inscriptionDeadline: string;

  @ApiProperty({
    description: 'Indicates if evaluations are opened for the event',
    example: false,
  })
  @IsBoolean()
  @IsNotEmpty()
  evaluationsOpened: boolean = false;

  @ApiProperty({
    description: 'Start date of the event (ISO 8601 format)',
    example: '2024-01-01T09:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    description: 'End date of the event (ISO 8601 format)',
    example: '2024-01-03T17:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({
    description: 'Location where the event will take place',
    example: 'Block K, 21K',
  })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({
    description: 'Type of event',
    enum: EventType,
    example: 'Exposition',
  })
  @Transform(transformEventType)
  @IsEnum(EventType)
  eventType: EventType;

  @ApiProperty({
    description: 'Optional inscription cost for the event',
    example: 25000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inscriptionCost?: number;

  @ApiProperty({
    description: 'Additional location details',
    example: 'Building K, room 204',
    required: false,
  })
  @IsOptional()
  @IsString()
  locationDetails?: string;

  @ApiProperty({
    description: 'Deprecated: use gradingScaleId. Kept for compatibility; without gradingScaleId, a new event gets the system scale of this type',
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
    description: 'Additional inscription requirements for participants',
    required: false,
  })
  @IsOptional()
  @IsString()
  inscriptionRequirements?: string;

  @ApiProperty({
    description: 'Minimum number of members required per team',
    required: false,
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minimumTeamSize?: number;

  @ApiProperty({
    description: 'Information about the event allies or partners',
    required: false,
  })
  @IsOptional()
  @IsString()
  aboutOurAllies?: string;

  @ApiProperty({
    description: 'Collaborators associated with the event',
    example: ['Faculty of Engineering', 'Innovation Lab'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  collaborators: string[] = [];

  @ApiProperty({
    description: 'Organizers of the event',
    example: ['University Events Office'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  organizers: string[] = [];

  @ApiProperty({
    description: 'Optional category to create together with the event',
    type: CreateEventCategoryDTO,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEventCategoryDTO)
  category?: CreateEventCategoryDTO;

  @ApiProperty({
    description: 'Awards created together with the category of the event',
    type: [CreateNestedAwardDTO],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateNestedAwardDTO)
  awards?: CreateNestedAwardDTO[];

  @ApiProperty({
    description: 'Specific inscription details created together with the event',
    type: [CreateSpecificInscriptionDetailDTO],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSpecificInscriptionDetailDTO)
  specificInscriptionDetails?: CreateSpecificInscriptionDetailDTO[];

  @ApiProperty({
    description: 'Alias of specificInscriptionDetails for nested event inscription details',
    type: [CreateSpecificInscriptionDetailDTO],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSpecificInscriptionDetailDTO)
  eventInscriptionDetails?: CreateSpecificInscriptionDetailDTO[];
}
 
