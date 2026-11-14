import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';

export class EvaluationScoreDto {
  @ApiProperty({
    description: 'Criterion ID',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  criterionId: number;

  @ApiProperty({
    description:
      'Level chosen by the juror: integer 1–4 (4 = Excelente, 3 = Bueno, 2 = Aceptable, 1 = Insuficiente). ' +
      'The event evaluation type maps it to points: FINAL_PROJECTS 90 / 75 / 55 / 25, ' +
      'ZERO_TO_FIVE 5 / 4 / 3 / 2, ZERO_TO_HUNDRED 100 / 80 / 60 / 40. The points are stored and used ' +
      'for the grade.',
    example: 4,
  })
  @IsInt()
  @IsNumber()
  @IsNotEmpty()
  score: number;
}

export class EvaluateProjectDto {
  @ApiProperty({
    description: 'Project ID to evaluate',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  projectId: number;

  @ApiProperty({
    description: 'Optional comments about the evaluation',
    example: 'Great project with solid implementation',
    required: false,
  })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiProperty({
    description: 'Array of scores for each criterion',
    type: [EvaluationScoreDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreDto)
  scores: EvaluationScoreDto[];
}
