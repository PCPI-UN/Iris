import { ApiProperty } from '@nestjs/swagger';

/** Response of GET /events/:eventId/course-sections. */

export class CourseSectionProfessorResponse {
  @ApiProperty({ example: 12 })
  userId: number;

  @ApiProperty({ example: 'Laura' })
  firstName: string;

  @ApiProperty({ example: 'Gómez', nullable: true })
  lastName: string | null;
}

export class CourseSectionResponse {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: '1001', description: 'NRC of the course section' })
  nrc: string;

  @ApiProperty({ example: 'Proyecto Final - Grupo 1' })
  name: string;

  @ApiProperty({
    type: CourseSectionProfessorResponse,
    nullable: true,
    description:
      'null when the professor account no longer exists or auth-service could not be reached (see professorsAvailable). Never includes the email.',
  })
  professor: CourseSectionProfessorResponse | null;
}

export class CourseSectionsResponse {
  @ApiProperty({
    type: [CourseSectionResponse],
    description:
      'Course sections of the academic term of the event, ordered by NRC. Empty when the event does not require a course section or has no term; the "no NRC" and "not applicable" fill rows are never listed.',
  })
  sections: CourseSectionResponse[];

  @ApiProperty({
    example: true,
    description:
      'false when auth-service failed: the sections are complete but every professor is null',
  })
  professorsAvailable: boolean;
}
