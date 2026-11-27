import { ApiProperty } from '@nestjs/swagger';

export const PROJECT_CHANGE_ACTIONS = [
  'STATE',
  'INFO',
  'CATEGORY',
  'PARTICIPANTS',
  'TUTORS',
  'DOCUMENTS',
  'CREATED',
] as const;

export type ProjectChangeAction = (typeof PROJECT_CHANGE_ACTIONS)[number];

export class ProjectChangeLogActorDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({
    example: 'Laura Gómez',
    nullable: true,
    type: String,
    description:
      'Null when the name could not be resolved (account deleted or auth-service failed)',
  })
  name: string | null;
}

export class ProjectChangeLogEntryDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ enum: PROJECT_CHANGE_ACTIONS, example: 'STATE' })
  action: ProjectChangeAction;

  @ApiProperty({ type: ProjectChangeLogActorDto })
  actor: ProjectChangeLogActorDto;

  @ApiProperty({ example: '2026-11-20T15:04:05.000Z', description: 'ISO 8601' })
  createdAt: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { state: 'APPROVED' },
    description: 'Changed fields only, with their values before the change',
  })
  before: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { state: 'REJECTED' },
    description: 'Changed fields only, with their values after the change',
  })
  after: Record<string, unknown>;

  @ApiProperty({
    example: 'El proyecto fue aprobado por error',
    nullable: true,
    type: String,
  })
  reason: string | null;
}

export class ProjectChangeLogResponseDto {
  @ApiProperty({
    type: [ProjectChangeLogEntryDto],
    description: 'Most recent first',
  })
  entries: ProjectChangeLogEntryDto[];
}
