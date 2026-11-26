import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsPositive,
} from 'class-validator';

export class CreateCriterionDto {
  @IsInt()
  @IsNotEmpty()
  eventId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  // Relative weight inside its component and category (1 by default)
  @IsNumber()
  @IsOptional()
  @IsPositive()
  weight?: number;

  @IsArray()
  @IsInt({ each: true })
  courseIds: number[];

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @IsNotEmpty()
  componentId: number;
}
