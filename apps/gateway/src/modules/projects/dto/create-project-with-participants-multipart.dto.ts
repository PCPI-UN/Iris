import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
  IsNumberString,
} from 'class-validator';
import { PendingParticipantInputDto } from './pending-participant-input.dto';
import { ProjectDocumentInputDto } from './project-document-input.dto';

/**
 * DTO for creating a project with participants via multipart/form-data
 * This is used when receiving file uploads from the frontend
 */
export class CreateProjectWithParticipantsMultipartDto {
  @ApiProperty({
    description: 'Event ID to which this project belongs',
    example: '1',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({
    description: 'Event type (e.g., "Competition", "Exposition")',
    example: 'Competition',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @ApiProperty({
    description: 'Course ID associated with this project',
    example: '1',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({
    description: 'Name of the project',
    example: 'Smart Home Automation System',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Código opcional del proyecto',
    required: false,
    example: '202301',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsNumberString()
  @MaxLength(50)
  projectCode?: string;

  @ApiProperty({
    description: 'Detailed description of the project',
    example: 'An IoT-based system for automating home appliances using Arduino and mobile app',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'JSON string array of participants/team members for the project',
    example: JSON.stringify([
      {
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        studentCode: '200178910',
        semester: '6',
        career: 'ing_sistemas',
      },
    ]),
    required: false,
  })
  @IsString()
  @IsOptional()
  participants?: string;

  @ApiProperty({
    description:
      'JSON string with the project tutors: `userIds` (existing Tutor/Professor users) and `pending` ' +
      '(name and email of tutors who are not registered; each one is invited). Optional.',
    example: JSON.stringify({
      userIds: [12],
      pending: [
        { firstName: 'Laura', lastName: 'Gómez', email: 'laura.gomez@university.edu' },
      ],
    }),
    required: false,
  })
  @IsString()
  @IsOptional()
  tutors?: string;

  @ApiProperty({
    description: 'JSON string array of document metadata (type)',
    example: JSON.stringify([
      { type: 'POSTER' },
      { type: 'SUPPORTING_DOCUMENT' },
    ]),
    required: false,
  })
  @IsString()
  @IsOptional()
  documents?: string;

  @ApiProperty({
    description: 'Document files (should match the order and count of documents metadata)',
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    required: false,
  })
  files?: Express.Multer.File[];
}
