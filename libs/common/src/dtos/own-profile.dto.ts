import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Fields a user can edit on their own profile. Shared by the gateway and
 * auth-service so both layers apply the same rules. Values are trimmed before
 * validation, so a value made only of spaces fails MinLength.
 */
export class OwnProfileFieldsDto {
  @ApiPropertyOptional({ example: 'Laura', minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Gómez', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: '3001234567',
    description: 'Colombian phone number, 10 digits',
  })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{10}$/, {
    message: 'phone must be a 10-digit Colombian phone number',
  })
  @IsPhoneNumber('CO')
  phone?: string;
}
