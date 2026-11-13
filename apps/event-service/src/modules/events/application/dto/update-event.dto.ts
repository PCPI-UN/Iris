import {
  IsInt,
  Min,
  IsString,
  IsOptional,
  IsBoolean,
  IsISO8601,
  MinLength,
  MaxLength,
  Matches,
  IsArray,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EvaluationType, EventType } from '@app/common/generated/event';
import {
  transformEvaluationType,
  transformEventType,
} from './event-type-transformer';

export class UpdateEventDTO {
  @IsInt()
  @Min(1)
  id: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'accessCode solo puede tener letras, números y guiones',
  })
  @MinLength(3)
  @MaxLength(50)
  accessCode?: string;

  @IsOptional()
  @IsBoolean()
  isPubliclyJoinable?: boolean;

  @IsOptional()
  @IsISO8601()
  inscriptionDeadline?: string;

  @IsOptional()
  @IsBoolean()
  evaluationsOpened?: boolean;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @Transform(transformEventType)
  @IsEnum(EventType)
  eventType?: EventType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  inscriptionCost?: number;

  @IsOptional()
  @IsString()
  locationDetails?: string;

  @IsOptional()
  @Transform(transformEvaluationType)
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;

  @IsOptional()
  @IsString()
  inscriptionRequirements?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumTeamSize?: number;

  @IsOptional()
  @IsString()
  aboutOurAllies?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collaborators?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizers?: string[];
}
