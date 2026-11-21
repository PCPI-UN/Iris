import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';

export enum EvaluationReportFormat {
  JSON = 'json',
  EXCEL = 'excel',
}

/** The student's report: the category is the one of their project */
export class GetMyProjectReportDto {
  @ApiPropertyOptional({
    description:
      'excel (default) downloads the XLSX; json returns the same data',
    enum: EvaluationReportFormat,
    example: EvaluationReportFormat.EXCEL,
  })
  @IsOptional()
  @IsEnum(EvaluationReportFormat)
  format?: EvaluationReportFormat = EvaluationReportFormat.EXCEL;
}

/**
 * The report is always of one category (department), as the approved format: the
 * positions are inside the category.
 */
export class GetEvaluationReportDto extends GetMyProjectReportDto {
  @ApiProperty({
    description: 'Category (department) of the event the report is about',
    example: 3,
  })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId!: number;
}
