import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { InvitationTargetType } from '../../domain/entities/invitation.entity';
import {
  CREATE_PLATFORM_INVITATIONS_PERMISSION,
  MANAGE_EVENTS_PERMISSION,
  PROJECT_INVITATION_ROLE_NAMES,
  holds,
} from '../../domain/policies/invitation-access';
import { AuthServicePort } from '../../infrastructure/ports/auth-service.port';
import { ProjectServicePort } from '../../infrastructure/ports/project-service.port';
import { normalizeEmail } from '@app/common/utils/email.util';

export interface AuthorizeInvitationInput {
  inviterUserId: number;
  email: string;
  targetType: InvitationTargetType;
  targetId: number;
  roleIds: number[];
}

/**
 * Fails with PERMISSION_DENIED (or INVALID_ARGUMENT for roles that do not fit the target)
 * unless the inviter may create this invitation: domain/policies/invitation-access.ts.
 *
 * The gateway calls it before CreateInvitation on POST /invitations. Services that create
 * invitations on their own (project-service, juror invitations) do not go through it.
 */
@Injectable()
export class AuthorizeInvitationUseCase {
  constructor(
    private readonly authService: AuthServicePort,
    private readonly projectService: ProjectServicePort,
  ) {}

  async execute(input: AuthorizeInvitationInput): Promise<void> {
    const roleIds = input.roleIds ?? [];
    const access = await this.authService.getUserPlatformAccess(input.inviterUserId);

    switch (input.targetType) {
      case InvitationTargetType.PLATFORM: {
        if (!holds(access, CREATE_PLATFORM_INVITATIONS_PERMISSION)) {
          throw this.denied('Solo quien tiene el permiso create:invitations puede invitar a la plataforma');
        }
        const inviter = await this.authService.getUser(input.inviterUserId);
        if (normalizeEmail(inviter.email) === normalizeEmail(input.email)) {
          throw this.denied('Un usuario no puede invitarse a sí mismo a la plataforma');
        }
        await this.forward(() =>
          this.authService.checkPlatformRoleGrant({
            actorUserId: input.inviterUserId,
            roleIds,
          }),
        );
        return;
      }

      case InvitationTargetType.EVENT:
        if (!holds(access, MANAGE_EVENTS_PERMISSION)) {
          throw this.denied('Solo quien administra eventos puede invitar a un evento');
        }
        return;

      case InvitationTargetType.PROJECT:
      case InvitationTargetType.PROJECT_TUTOR:
        await this.assertOnlyRole(roleIds, PROJECT_INVITATION_ROLE_NAMES[input.targetType]!);
        // project-service: a confirmed participant of the project or manage:events
        await this.forward(() =>
          this.projectService.checkCanEditProject(input.inviterUserId, input.targetId),
        );
        return;

      default:
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Tipo de destino no válido: ${input.targetType}`,
        });
    }
  }

  private async assertOnlyRole(roleIds: number[], allowedRoleName: string): Promise<void> {
    if (roleIds.length === 0) return;
    const { roles } = await this.authService.getRolesByIds([...new Set(roleIds)]);
    const others = (roles ?? []).filter((role) => role.name !== allowedRoleName);
    if (others.length > 0 || (roles ?? []).length !== new Set(roleIds).size) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Esta invitación solo puede dar el rol ${allowedRoleName}`,
      });
    }
  }

  /**
   * A gRPC error from another service arrives as a plain error with `code` and `details`;
   * thrown as is it becomes UNKNOWN (500 in the gateway). Keep its code (403, 404, 400).
   */
  private async forward(call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch (error) {
      if (error instanceof RpcException) throw error;
      const { code, details, message } = (error ?? {}) as { code?: number; details?: string; message?: string };
      throw new RpcException({
        code: typeof code === 'number' ? code : status.INTERNAL,
        message: details || message || 'No se pudo comprobar la invitación',
      });
    }
  }

  private denied(message: string): RpcException {
    return new RpcException({ code: status.PERMISSION_DENIED, message });
  }
}
