import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  Min,
  Max,
  ArrayMinSize,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCriterionDto {
  @ApiProperty({
    description: 'Event ID to which this criterion belongs',
    example: 1,
  })
  @IsInt()
  @Type(() => Number)
  eventId: number;

  @ApiProperty({
    description: 'Name of the criterion',
    example: 'Innovation',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Detailed description of the criterion',
    example: 'Evaluates the originality and creativity of the solution',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Weight of the criterion in the evaluation (0-1). Required only for criteria without component: ' +
      'inside a component the weight is the component weight split in equal parts among its criteria, ' +
      'and any value sent here is ignored.',
    example: 0.25,
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @ValidateIf((dto: CreateCriterionDto) => dto.componentId === undefined || dto.weight !== undefined)
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  weight?: number;

  @ApiProperty({
    description: 'Array of course IDs to associate with this criterion',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @Type(() => Number)
  courseIds: number[];

  @ApiProperty({
    description: 'Component ID to associate with this criterion (optional)',
    example: 1,
    type: Number,
  })
  @IsInt()
  @IsOptional()
  componentId?: number;
}
