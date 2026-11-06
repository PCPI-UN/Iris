import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
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

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(1)
  weight: number;

  @IsArray()
  @IsInt({ each: true })
  courseIds: number[];

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @IsOptional()
  componentId?: number;
}
