import { ApiProperty } from '@nestjs/swagger';
import { ProjectDocument, ProjectParticipant, PendingProjectParticipant, ProjectTutor } from '@app/common/generated/project';

export class ProjectReviewInfoDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  eventId: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  description?: string;

  @ApiProperty({ required: false, nullable: true })
  eventNumber?: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty()
  courseId: number;

  @ApiProperty()
  state: number;

  @ApiProperty({ required: false, nullable: true })
  reason?: string;
}

export class ProjectForReviewResponseDto {
  @ApiProperty({ type: [Object] })
  confirmedParticipants: ProjectParticipant[];

  @ApiProperty({ type: [Object] })
  pendingParticipants: PendingProjectParticipant[];

  @ApiProperty({
    type: [Object],
    description: 'Linked tutors (`pending: false`) and invited tutors who have not accepted yet (`pending: true`, with email)',
  })
  tutors: ProjectTutor[];

  @ApiProperty({ type: ProjectReviewInfoDto })
  project: ProjectReviewInfoDto;

  @ApiProperty({
    description: 'Código del proyecto',
    required: false,
    example: '202301',
    nullable: true,
  })
  projectCode?: string | null;

  @ApiProperty({ type: [Object] })
  documents: ProjectDocument[];
}
