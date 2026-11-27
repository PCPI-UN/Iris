import { ApiProperty, OmitType } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { CreateProjectWithParticipantsMultipartDto } from './create-project-with-participants-multipart.dto';

export const ADMIN_CREATE_STATES = ['APPROVED', 'UNDER_REVIEW'] as const;
export type AdminCreateStateDto = (typeof ADMIN_CREATE_STATES)[number];

/**
 * POST /projects/admin (multipart/form-data): the fields of the public submission without
 * eventType (read from the event) and with the initial state.
 */
export class AdminCreateProjectMultipartDto extends OmitType(
  CreateProjectWithParticipantsMultipartDto,
  ['eventType', 'name', 'description'] as const,
) {
  @ApiProperty({
    description: 'Name of the project, unique in the event (in any category)',
    example: 'Robot recolector',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  name: string;

  @ApiProperty({
    description: 'Detailed description of the project',
    required: false,
    maxLength: 3000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiProperty({
    description:
      'Initial state. APPROVED (default): tutors are activated and pending participants get the approval email. ' +
      'UNDER_REVIEW: both happen when the project is approved',
    enum: ADMIN_CREATE_STATES,
    required: false,
    example: 'APPROVED',
  })
  @IsOptional()
  @IsIn(ADMIN_CREATE_STATES)
  state?: AdminCreateStateDto;
}
