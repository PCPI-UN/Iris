export interface InvitationCommandPort {
  createInvitation(input: {
    email: string;
    targetType: 'PROJECT' | 'PROJECT_TUTOR' | 'EVENT' | 'PLATFORM';
    targetId: number;
    firstName?: string;
    lastName?: string;
    dedupKey?: string;
    requestedByUserId?: number; // del JWT
  }): Promise<{ created: boolean; invitationId?: string }>;
}