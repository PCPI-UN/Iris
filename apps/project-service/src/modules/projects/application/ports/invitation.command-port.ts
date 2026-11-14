export const INVITATION_COMMAND_PORT = 'INVITATION_COMMAND_PORT';

export interface InvitationCommandPort {
  createInvitation(input: {
    email: string;
    targetType: 'PROJECT' | 'PROJECT_TUTOR' | 'EVENT' | 'PLATFORM';
    eventType?: string;
    roleIds?: number[];
    targetId: number;
    firstName?: string;
    lastName?: string;
    dedupKey?: string;
    requestedByUserId?: number; // del JWT
  }): Promise<{ created: boolean; invitationId?: string }>;
}