import { IsEmail, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class FindPendingByEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  targetType: string;

  @IsInt()
  @Min(1)
  targetId: number;
}
