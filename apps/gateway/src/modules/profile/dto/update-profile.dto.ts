import { IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a user can edit on their own profile. Any other field in the body
 * (email, password, status, roles, academic data...) is rejected with 400.
 */
export const EDITABLE_PROFILE_FIELDS = ['firstName', 'lastName', 'phone'] as const;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Laura', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Gómez', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '3001234567', description: 'Colombian phone number, 10 digits' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be a 10-digit Colombian phone number' })
  phone?: string;
}
