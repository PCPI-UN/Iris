import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreateTermDto {
  @ApiProperty({ description: 'Year of the term', example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({
    description: 'Period code within the year, as in the term code (2026 + "10" is 202610)',
    example: '10',
  })
  @IsString()
  @Matches(/^\d{2}$/, { message: 'period debe ser un código de dos dígitos, como 10 o 20' })
  period: string;
}
