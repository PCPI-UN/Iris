import { PendingProjectTutorInput } from '../../domain/entities/project.entity';

export interface TutorSelectionDTO {
  tutorUserIds?: number[];
  pendingTutors?: PendingProjectTutorInput[];
}

export interface SetProjectTutorsDTO extends TutorSelectionDTO {
  projectId: number;
  /** Passed through to the invitation request; the tutor invitation does not depend on it. */
  eventType?: string;
}
