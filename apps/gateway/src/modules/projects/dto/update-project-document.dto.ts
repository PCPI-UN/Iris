import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { TypedDocument } from './project-document-input.dto';

export enum DocumentStatusFilter {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * A document's file can only be replaced by uploading a new one: a URL sent by
 * the client is not accepted, so a document never points to another file of the
 * storage or to an external site.
 */
export class UpdateProjectDocumentDto {
  @ApiPropertyOptional({
    description: 'New document type',
    enum: TypedDocument,
    example: TypedDocument.POSTER,
  })
  @IsOptional()
  @IsEnum(TypedDocument)
  @Transform(({ value }: { value: any }) => value === '' ? undefined : value)
  type?: TypedDocument;

  @ApiPropertyOptional({
    description: 'New document status',
    enum: DocumentStatusFilter,
    example: DocumentStatusFilter.ACTIVE,
  })
  @IsOptional()
  @IsEnum(DocumentStatusFilter)
  @Transform(({ value }: { value: any }) => value === '' ? undefined : value)
  state?: DocumentStatusFilter;
}
