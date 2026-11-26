import { IsInt, IsString, IsNumber, IsOptional, Min, Max, IsNotEmpty } from 'class-validator';

// A component always stays in the event it was created for
export class UpdateComponentDto {
  @IsInt()
  @IsNotEmpty()
  id: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  weight?: number;
}
