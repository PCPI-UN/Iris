import { ApiProperty } from '@nestjs/swagger';

/**
 * Response of GET /students/me/dashboard, with the field names the frontend expects.
 */

export class StudentDashboardProfile {
  @ApiProperty({ example: 10293 })
  id: number;

  @ApiProperty({ example: 'María' })
  firstName: string;

  @ApiProperty({ example: 'García' })
  lastName: string;

  @ApiProperty({ example: 'maria@uninorte.edu.co' })
  email: string;

  @ApiProperty({
    example: '200145892',
    nullable: true,
    type: String,
    description: 'From the most recent project submission',
  })
  studentCode: string | null;

  @ApiProperty({
    example: 'Ingeniería de Sistemas y Computación',
    nullable: true,
    type: String,
  })
  career: string | null;

  @ApiProperty({
    example: 8,
    nullable: true,
    type: Number,
    description: 'Semester the student reported in the most recent submission',
  })
  semester: number | null;
}

export class StudentDashboardKpis {
  @ApiProperty({
    example: 3,
    description: 'Events with at least one approved project of the student',
  })
  totalFairs: number;

  @ApiProperty({ example: 3, description: 'Approved projects of the student' })
  totalProjects: number;

  @ApiProperty({
    example: 1,
    description: 'Awards won by those projects (co-winners included)',
  })
  totalAwards: number;
}

export class StudentDashboardCurrentProject {
  @ApiProperty({ example: 34 })
  id: number;

  @ApiProperty({ example: 3 })
  eventId: number;

  @ApiProperty({ example: 'Feria de Ingeniería & Ciencias 2026-10' })
  eventName: string;

  @ApiProperty({
    example: '2026-30',
    description:
      'AAAA-10 (January to June) or AAAA-30 (July to December), from the event start date',
  })
  semester: string;

  @ApiProperty({ example: 'PROY-2026-088', nullable: true, type: String })
  projectCode: string | null;

  @ApiProperty({ example: 'Plataforma de detección de fugas' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({
    example: 'Ingeniería de Sistemas',
    nullable: true,
    type: String,
    description: 'Category (course) of the project in the event',
  })
  categoryName: string | null;

  @ApiProperty({
    example: 'APPROVED',
    enum: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REQUEST_CHANGES'],
  })
  enrollmentStatus: string;

  @ApiProperty({
    example: false,
    description:
      'true only while the event is not over and changes were requested',
  })
  canEdit: boolean;

  @ApiProperty({
    example: 2,
    description: 'Team members captured at submission',
  })
  participantsCount: number;

  @ApiProperty({
    example: 2,
    description: 'Active documents (poster, logo, supporting documents)',
  })
  documentsCount: number;
}

export class StudentDashboardEvaluation {
  @ApiProperty({
    example: false,
    description:
      'true when the admin published the results of the current event',
  })
  resultsPublished: boolean;

  @ApiProperty({ example: null, nullable: true, type: Number })
  finalScore: number | null;
}

export class StudentDashboardTrajectoryItem {
  @ApiProperty({ example: 34, description: 'Project id' })
  id: number;

  @ApiProperty({ example: 3 })
  eventId: number;

  @ApiProperty({ example: '2026-10' })
  semester: string;

  @ApiProperty({ example: 'Feria de Ingeniería & Ciencias 2026-10' })
  eventName: string;

  @ApiProperty({
    example: 'Ingeniería de Sistemas',
    nullable: true,
    type: String,
    description: 'Category (course) of the project in the event',
  })
  courseName: string | null;

  @ApiProperty({ example: 'Plataforma de detección de fugas' })
  projectName: string;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description:
      'Average of the jurors grades; null until the event results are published or when it was not evaluated',
  })
  finalScore: number | null;

  @ApiProperty({
    example: 'Primer puesto',
    nullable: true,
    type: String,
    description: 'Award titles won in the event, comma separated',
  })
  award: string | null;

  @ApiProperty({
    example: false,
    description: 'true while the event has not ended',
  })
  isCurrent: boolean;

  @ApiProperty({
    type: [Object],
    example: [],
    description: 'Always empty for now: there is no certificate model yet',
  })
  certificates: never[];
}

export class StudentDashboardSemester {
  @ApiProperty({ example: '2026-10' })
  semester: string;

  @ApiProperty({ example: 1 })
  fairs: number;

  @ApiProperty({ example: 1 })
  projects: number;

  @ApiProperty({ example: 1 })
  awards: number;
}

export class StudentDashboardResponse {
  @ApiProperty({ type: StudentDashboardProfile })
  profile: StudentDashboardProfile;

  @ApiProperty({ type: StudentDashboardKpis })
  kpis: StudentDashboardKpis;

  @ApiProperty({
    type: StudentDashboardCurrentProject,
    nullable: true,
    description:
      'Project of an event that has not ended, in any review state; null when there is none',
  })
  currentProject: StudentDashboardCurrentProject | null;

  @ApiProperty({
    type: StudentDashboardEvaluation,
    nullable: true,
    description: 'null when there is no current project',
  })
  evaluation: StudentDashboardEvaluation | null;

  @ApiProperty({
    type: [StudentDashboardTrajectoryItem],
    description: 'Approved projects, most recent event first',
  })
  trajectory: StudentDashboardTrajectoryItem[];

  @ApiProperty({
    type: [StudentDashboardSemester],
    description:
      'Participation by semester, oldest first (evolution over time)',
  })
  bySemester: StudentDashboardSemester[];
}
