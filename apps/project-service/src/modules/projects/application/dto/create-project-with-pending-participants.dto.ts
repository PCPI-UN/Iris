import { CreateProjectDTO } from './create-project.dto';
import { TutorSelectionDTO } from './set-project-tutors.dto';
import { TypedDocument } from '../../domain/entities/project.entity';

export interface PendingParticipantInput {
  firstName: string;
  lastName?: string | null;
  email: string;
  studentCode: string;
  semester: string;
  career: string;
}

/** Public submission: the project, its students (still without an account), tutors and uploaded documents */
export interface CreateProjectWithPendingParticipantsDTO
  extends Omit<CreateProjectDTO, 'state'>, TutorSelectionDTO {
  /** Picks the invitation email template */
  eventType?: string;
  participants?: PendingParticipantInput[];
  documents?: { url: string; type: TypedDocument }[];
}
