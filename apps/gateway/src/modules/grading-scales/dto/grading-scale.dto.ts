import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GradingScaleLevelDto {
  @ApiProperty({ description: 'Level the juror picks, from 1 (lowest) to 4 (highest)', example: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  level!: number;

  @ApiProperty({ description: 'Label shown for the level', example: 'Excelente', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label!: string;

  @ApiProperty({
    description: 'Points the level is worth; at most 2 decimals and greater than the points of the level below',
    example: 40,
  })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(99999.99)
  points!: number;
}

/** A grading scale: a name and exactly 4 levels whose points grow from level 1 to level 4. */
export class GradingScaleDto {
  @ApiProperty({ description: 'Name of the scale', example: 'Decenas', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false, description: 'Description of the scale' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: [GradingScaleLevelDto],
    description: 'Exactly 4 levels, numbered 1 to 4',
    example: [
      { level: 1, label: 'Insuficiente', points: 10 },
      { level: 2, label: 'Aceptable', points: 20 },
      { level: 3, label: 'Bueno', points: 30 },
      { level: 4, label: 'Excelente', points: 40 },
    ],
  })
  @IsArray()
  @ArrayMinSize(4, { message: 'a grading scale must have exactly 4 levels' })
  @ArrayMaxSize(4, { message: 'a grading scale must have exactly 4 levels' })
  @ValidateNested({ each: true })
  @Type(() => GradingScaleLevelDto)
  levels!: GradingScaleLevelDto[];
}
