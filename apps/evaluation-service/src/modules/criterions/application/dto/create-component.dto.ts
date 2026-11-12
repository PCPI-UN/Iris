import { IsString, IsNumber, IsInt, IsNotEmpty, Min, Max } from 'class-validator';

export class CreateComponentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Fraction of the grade (0-1); the components of an event add up to 1
  @IsNumber()
  @Min(0)
  @Max(1)
  weight: number;

  @IsInt()
  @IsNotEmpty()
  eventId: number;
}
