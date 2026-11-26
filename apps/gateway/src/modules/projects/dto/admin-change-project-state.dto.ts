import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const ADMIN_PROJECT_STATES = [
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REQUEST_CHANGES',
] as const;

export type AdminProjectState = (typeof ADMIN_PROJECT_STATES)[number];

export class AdminChangeProjectStateDto {
  @ApiProperty({
    description:
      'New state of the project; it must differ from the current one',
    enum: ADMIN_PROJECT_STATES,
    example: 'UNDER_REVIEW',
  })
  @IsIn(ADMIN_PROJECT_STATES, {
    message:
      'El estado debe ser UNDER_REVIEW, APPROVED, REJECTED o REQUEST_CHANGES',
  })
  state: AdminProjectState;

  @ApiProperty({
    description:
      'Why the state is corrected. Stored in the change log, and in the project reason (shown in its email) for REJECTED and REQUEST_CHANGES',
    example:
      'Se aprobó por error: el proyecto no cumple los requisitos de la categoría',
    maxLength: 1000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El motivo del cambio de estado debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo del cambio de estado es obligatorio' })
  @MaxLength(1000, {
    message: 'El motivo del cambio de estado no puede superar 1000 caracteres',
  })
  reason: string;

  @ApiPropertyOptional({
    description:
      'true: the pending participants get the email of the new state (approved, rejected or changes requested; none for UNDER_REVIEW). Default false',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'notify debe ser verdadero o falso' })
  notify?: boolean;

  @ApiPropertyOptional({
    description:
      'true: apply the change even if the project has juror evaluations or the event has published results. Default false',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'force debe ser verdadero o falso' })
  force?: boolean;
}
