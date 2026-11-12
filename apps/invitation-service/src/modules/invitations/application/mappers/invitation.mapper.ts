import {
  Invitation as InvitationProto,
  InvitationStatus as ProtoInvitationStatus,
  InvitationTargetType as ProtoInvitationTargetType,
  GetEventInvitationsResponse,
  GetUserInvitationsResponse,
} from '@app/common/generated/invitation';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '@invitations/domain/entities/invitation.entity';
import { InvitationRole } from '@invitations/domain/entities/invitation-role.entity';

export class InvitationMapper {
  /**
   * Maps domain Invitation and InvitationRoles to Proto Invitation
   */
  static toProto(
    invitation: Invitation,
    invitationRoles: InvitationRole[],
  ): InvitationProto {
    return {
      id: invitation.id,
      token: invitation.token,
      email: invitation.email,
      targetType: this.mapTargetTypeToProto(invitation.targetType),
      targetId: invitation.targetId,
      status: this.mapStatusToProto(invitation.status),
      expiresAt: invitation.expiresAt.toISOString(),
      invitedByUserId: invitation.invitedByUserId,
      invitedUserId: invitation.invitedUserId,
      roleIds: invitationRoles.map((ir) => ir.roleId),
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  /**
   * Maps domain InvitationStatus to Proto InvitationStatus enum value
   */
  private static mapStatusToProto(status: InvitationStatus): ProtoInvitationStatus {
    const statusMap: Record<string, ProtoInvitationStatus> = {
      'PENDING': ProtoInvitationStatus.PENDING,
      'EXPIRED': ProtoInvitationStatus.EXPIRED,
      'REJECTED': ProtoInvitationStatus.REJECTED,
      'ACCEPTED': ProtoInvitationStatus.ACCEPTED,
    };
    return statusMap[status];
  }

  /**
   * Maps domain InvitationTargetType to Proto InvitationTargetType enum value
   */
  private static mapTargetTypeToProto(targetType: InvitationTargetType): ProtoInvitationTargetType {
    const targetTypeMap: Record<string, ProtoInvitationTargetType> = {
      'EVENT': ProtoInvitationTargetType.EVENT,
      'PLATFORM': ProtoInvitationTargetType.PLATFORM,
      'PROJECT': ProtoInvitationTargetType.PROJECT,
      'PROJECT_TUTOR': ProtoInvitationTargetType.PROJECT_TUTOR,
    };
    return targetTypeMap[targetType];
  }
  static toGetEventInvitationsResponse(
    invitations: Invitation[],
    total: number,
    page: number,
    limit: number,
    roles: InvitationRole[] = [],
  ): GetEventInvitationsResponse {
    return {
      invitations: invitations.map((inv) => {
        const invRoles = roles.filter((r) => r.invitationId === inv.id);
        return this.toProto(inv, invRoles);
      }),
      meta: {
        total,
        itemsOnCurrentPage: invitations.length,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static toGetUserInvitationsResponse(
    invitations: Invitation[],
    total: number,
    page: number,
    limit: number,
    roles: InvitationRole[] = [],
  ): GetUserInvitationsResponse {
    return {
      invitations: invitations.map((inv) => {
        const invRoles = roles.filter((r) => r.invitationId === inv.id);
        return this.toProto(inv, invRoles);
      }),
      meta: {
        total,
        itemsOnCurrentPage: invitations.length,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
