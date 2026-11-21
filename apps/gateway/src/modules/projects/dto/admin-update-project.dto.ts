import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Fields of the body that edit the project; at least one must be sent. */
export const ADMIN_PROJECT_EDITABLE_FIELDS = [
  'name',
  'description',
  'projectCode',
  'eventNumber',
  'courseId',
] as const;

/**
 * Administrative edit of the basic data and the category of a project. Only the fields sent
 * are changed; the state is not editable here (PATCH /projects/:id/admin/state).
 */
export class AdminUpdateProjectDto {
  @ApiPropertyOptional({
    description: 'New name; it must be free among the projects of the event',
    example: 'Robot clasificador de residuos',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El nombre del proyecto debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre del proyecto no puede estar vacío' })
  @MaxLength(255, {
    message: 'El nombre del proyecto no puede superar 255 caracteres',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'New description; an empty text or null clears it',
    example: 'Clasifica residuos con visión por computador',
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'La descripción debe ser un texto' })
  description?: string | null;

  @ApiPropertyOptional({
    description: 'New project code; an empty text or null clears it',
    example: 'ING-042',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El código del proyecto debe ser un texto' })
  @MaxLength(50, {
    message: 'El código del proyecto no puede superar 50 caracteres',
  })
  projectCode?: string | null;

  @ApiPropertyOptional({
    description:
      'New number of the project in the event; an empty text or null clears it',
    example: '17',
    maxLength: 150,
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El número en el evento debe ser un texto' })
  @MaxLength(150, {
    message: 'El número en el evento no puede superar 150 caracteres',
  })
  eventNumber?: string | null;

  @ApiPropertyOptional({
    description:
      "New category (course) id; it must be an active category of the project's event. " +
      'If the project has juror evaluations the change needs force',
    example: 3,
  })
  @IsOptional()
  @IsInt({ message: 'La categoría debe ser un número entero' })
  @Min(1, { message: 'La categoría no es válida' })
  courseId?: number;

  @ApiPropertyOptional({
    description: 'Why the project is corrected; stored in the change log',
    example: 'El estudiante inscribió el proyecto en la categoría equivocada',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(1000, { message: 'El motivo no puede superar 1000 caracteres' })
  reason?: string;

  @ApiPropertyOptional({
    description:
      'true: change the category even if the project has juror evaluations. Default false',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'force debe ser verdadero o falso' })
  force?: boolean;
}
