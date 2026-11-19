import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreateTermDTO {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  /** Period code within the year, as in the university's term code: "10", "20", ... */
  @IsString()
  @Matches(/^\d{2}$/, { message: 'period debe ser un código de dos dígitos, como 10 o 20' })
  period: string;
}
