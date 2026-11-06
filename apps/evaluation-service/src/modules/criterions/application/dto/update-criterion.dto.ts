import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
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

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
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
