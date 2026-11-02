import {
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Fields a user can change on their own account.
 * Restricted fields (email, password, status, active, roles) are not part of
 * this DTO, so the global ValidationPipe (forbidNonWhitelisted) rejects them.
 */
export class UpdateOwnProfileDto {
  @IsInt()
  userId: number;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  lastName?: string;

  @IsPhoneNumber('CO')
  @IsOptional()
  phone?: string;
}
