export enum InvitationStatus {
  PENDING = 'PENDING',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
  ACCEPTED = 'ACCEPTED',
}

export enum InvitationTargetType {
  EVENT = 'EVENT',
  PLATFORM = 'PLATFORM',
  PROJECT = 'PROJECT',
  PROJECT_TUTOR = 'PROJECT_TUTOR',
}

/** Platform role id of `Tutor`, granted when a project tutor accepts the invitation. */
export const TUTOR_ROLE_ID = 10;

export class Invitation {
  constructor(
    public readonly id: string,
    public token: string,
    public email: string,
    public targetType: InvitationTargetType,
    public targetId: number,
    public status: InvitationStatus,
    public expiresAt: Date,
    public invitedByUserId: number,
    public invitedUserId: number,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) { }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  canBeAccepted(): boolean {
    return this.status === InvitationStatus.PENDING && !this.isExpired();
  }

  canBeRejected(): boolean {
    return this.status === InvitationStatus.PENDING && !this.isExpired();
  }

  accept(invitedUserId: number): void {
    if (!this.canBeAccepted()) {
      throw new Error('Invitation cannot be accepted');
    }
    this.status = InvitationStatus.ACCEPTED;
    this.invitedUserId = invitedUserId;
  }

  reject(): void {
    if (!this.canBeRejected()) {
      throw new Error('Invitation cannot be rejected');
    }
    this.status = InvitationStatus.REJECTED;
  }

  expire(): void {
    this.status = InvitationStatus.EXPIRED;
  }
}