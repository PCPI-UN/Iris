import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Without userId the body describes a pending participant, whose fields are then required */
const isPending = (body: AdminAddParticipantDto) =>
  body.userId === undefined || body.userId === null;

/**
 * Participant added by an administrator: an enrolled one (userId and studentCode) or a pending
 * one (firstName, email, studentCode, semester, career and optionally lastName).
 */
export class AdminAddParticipantDto {
  @ApiPropertyOptional({
    description:
      'Platform user to add as an enrolled participant. Leave it out to add a pending participant',
    example: 42,
  })
  @IsOptional()
  @IsInt({ message: 'El ID de usuario debe ser un número entero' })
  @Min(1, { message: 'El ID de usuario no es válido' })
  userId?: number;

  @ApiPropertyOptional({
    description: 'Student code; required for both kinds of participant',
    example: '2021123456',
    maxLength: 20,
  })
  @Transform(trim)
  @IsString({ message: 'El código de estudiante debe ser un texto' })
  @IsNotEmpty({ message: 'El código de estudiante es obligatorio' })
  @MaxLength(20, {
    message: 'El código de estudiante no puede superar 20 caracteres',
  })
  studentCode: string;

  @ApiPropertyOptional({
    description: 'Pending participant: first name',
    example: 'Ana',
    maxLength: 100,
  })
  @ValidateIf(isPending)
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre del integrante es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Pending participant: last name',
    example: 'Pérez',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El apellido debe ser un texto' })
  @MaxLength(100, { message: 'El apellido no puede superar 100 caracteres' })
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'Pending participant: email, where the invitation is sent once the project is approved',
    example: 'ana.perez@university.edu',
  })
  @ValidateIf(isPending)
  @Transform(trim)
  @IsEmail({}, { message: 'El formato del correo no es válido' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Pending participant: current semester',
    example: '6',
  })
  @ValidateIf(isPending)
  @Transform(trim)
  @IsNumberString({}, { message: 'El semestre debe ser un número' })
  semester?: string;

  @ApiPropertyOptional({
    description: 'Pending participant: academic program',
    example: 'ing_sistemas',
    maxLength: 255,
  })
  @ValidateIf(isPending)
  @Transform(trim)
  @IsString({ message: 'La carrera debe ser un texto' })
  @IsNotEmpty({ message: 'La carrera es obligatoria' })
  @MaxLength(255, { message: 'La carrera no puede superar 255 caracteres' })
  career?: string;

  @ApiPropertyOptional({
    description: 'Why the participant is added; stored in the change log',
    example: 'El estudiante quedó por fuera de la inscripción',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(1000, { message: 'El motivo no puede superar 1000 caracteres' })
  reason?: string;
}

/** Query of the removal endpoints. */
export class AdminRemoveParticipantQueryDto {
  @ApiPropertyOptional({
    description: 'Why the participant is removed; stored in the change log',
    example: 'El estudiante se retiró del proyecto',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(1000, { message: 'El motivo no puede superar 1000 caracteres' })
  reason?: string;
}
