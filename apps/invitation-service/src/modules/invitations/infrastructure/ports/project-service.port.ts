import type {
  Project,
  AddParticipantResponse,
  PendingProjectParticipant,
} from '@app/common/generated/project';

export abstract class ProjectServicePort {
  /**
   * Retrieves project details by project ID.
   *
   * @param projectId - The ID of the project
   * @returns Project details or null if not found
   */
  abstract getProject(projectId: number): Promise<Project | null>;

  /**
   * Adds a participant to a project.
   *
   * @param params - Participant creation parameters
   * @returns The created participant
   */
  abstract addParticipant(params: {
    projectId: number;
    userId: number;
    studentCode: string;
  }): Promise<AddParticipantResponse>;

  /**
   * Links a platform user as tutor of a project and marks the pending tutor
   * with that email as joined. Fails when the project has no pending tutor with that email.
   */
  abstract addProjectTutor(params: {
    projectId: number;
    userId: number;
    email: string;
  }): Promise<void>;

  /**
   * Retrieves the pending participants for a project.
   *
   * @param projectId - The project ID
   * @returns The list of pending participants
   */
  abstract listPendingParticipants(
    projectId: number,
  ): Promise<PendingProjectParticipant[]>;
}
