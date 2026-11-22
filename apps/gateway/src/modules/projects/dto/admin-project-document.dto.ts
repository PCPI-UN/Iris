import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentStatusFilter } from './update-project-document.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Largest file accepted when an administrator replaces a document: the limit of POST /projects/:projectId/documents */
export const ADMIN_DOCUMENT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Text fields of the multipart body of an administrative replacement; the file goes in `file`. */
export class AdminReplaceProjectDocumentDto {
  @ApiPropertyOptional({
    description: 'Why the file is replaced; stored in the change log',
    example: 'El póster subido era de otro proyecto',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(1000, { message: 'El motivo no puede superar 1000 caracteres' })
  reason?: string;
}

export class AdminChangeProjectDocumentStateDto {
  @ApiProperty({
    description:
      'INACTIVE withdraws the document from every read of the project; ACTIVE shows it again',
    enum: DocumentStatusFilter,
    example: DocumentStatusFilter.INACTIVE,
  })
  @IsEnum(DocumentStatusFilter, {
    message: 'El estado del documento debe ser ACTIVE o INACTIVE',
  })
  state: DocumentStatusFilter;

  @ApiPropertyOptional({
    description: 'Why the state changes; stored in the change log',
    example: 'Documento de soporte con datos personales',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(1000, { message: 'El motivo no puede superar 1000 caracteres' })
  reason?: string;
}
