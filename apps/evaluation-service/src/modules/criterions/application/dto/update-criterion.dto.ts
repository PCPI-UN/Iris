import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsPositive,
} from 'class-validator';

export class UpdateCriterionDto {
  @IsInt()
  @IsNotEmpty()
  id: number;

  @IsInt()
  @IsOptional()
  eventId?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  // Relative weight inside its component and category
  @IsNumber()
  @IsOptional()
  @IsPositive()
  weight?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  courseIds?: number[];

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @IsOptional()
  componentId?: number;
}
