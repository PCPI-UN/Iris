import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsPositive,
  ArrayMinSize,
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
      'Relative weight of the criterion inside its component and category (1 by default). ' +
      'The effective weight in the grade is componentWeight × weight ÷ sum of the weights of the component ' +
      'criteria in that category; e.g. 10 / 9 / 9 in a 0.3 component gives 0.107 / 0.096 / 0.096.',
    example: 1,
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
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
    description: 'Component of the event the criterion belongs to',
    example: 1,
    type: Number,
  })
  @IsInt()
  @Type(() => Number)
  componentId: number;
}
