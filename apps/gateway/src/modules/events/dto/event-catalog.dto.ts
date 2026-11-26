import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// Query params arrive as strings: 'true' / 'false' become booleans; anything
// else is left as is so @IsBoolean rejects it.
function toBooleanQuery({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class PaginationQueryDTO {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class CreateCategoryDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  eventId: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean = true;
}

export class UpdateCategoryDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;

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

export class ListCategoriesDTO extends PaginationQueryDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  eventId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toBooleanQuery)
  @IsBoolean()
  onlyActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateCategoryAwardDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  categoryId: number;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  position?: number = 0;
}

export class UpdateCategoryAwardDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;

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

export class ListCategoryAwardsDTO extends PaginationQueryDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class CreateAwardWinnerDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  awardId: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  projectId: number;

  @ApiProperty()
  @IsNumber()
  grade: number;
}

export class UpdateAwardWinnerDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  projectId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  grade?: number;
}

export class ListAwardWinnersDTO extends PaginationQueryDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  awardId?: number;
}

export class CreateEventInscriptionDetailDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  eventId: number;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  value?: number = 0;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean = true;
}

export class UpdateEventInscriptionDetailDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;

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

export class ListEventInscriptionDetailsDTO extends PaginationQueryDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  eventId?: number;
}

export class CreateEventRecapDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  eventId: number;

  @ApiProperty()
  @IsString()
  headline: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  closingMessage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  galeryUrl?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean = false;
}

export class UpdateEventRecapDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  closingMessage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  galeryUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class ListEventRecapsDTO extends PaginationQueryDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  eventId?: number;
}
