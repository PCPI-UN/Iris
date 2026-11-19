import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsISO8601,
  MinLength,
  MaxLength,
  Matches,
  IsInt,
  Min,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EvaluationType, EventType } from '@app/common/generated/event';
import {
  transformEvaluationType,
  transformEventType,
} from './event-type-transformer';

export class CreateEventDTO {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'accessCode solo puede tener letras, números y guiones',
  })
  @MinLength(3)
  @MaxLength(50)
  accessCode: string;

  @IsBoolean()
  isPubliclyJoinable: boolean = false;

  @IsISO8601()
  inscriptionDeadline: string;

  @IsBoolean()
  evaluationsOpened: boolean = false;

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location: string;

  @Transform(transformEventType)
  @IsEnum(EventType)
  eventType: EventType;

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

  @IsArray()
  @IsString({ each: true })
  collaborators: string[] = [];

  @IsArray()
  @IsString({ each: true })
  organizers: string[] = [];

  @IsOptional()
  @IsInt()
  @Min(1)
  createdByUserId?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;
 
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

}
