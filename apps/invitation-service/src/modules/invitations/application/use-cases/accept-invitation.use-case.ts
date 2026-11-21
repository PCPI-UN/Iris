import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AcceptInvitationDto } from '../dto/accept-invitation.dto';
import { InvitationRepositoryPort } from '../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../domain/repositories/invitation-role.repository.port';
import { AuthServicePort } from '../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../infrastructure/ports/event-service.port';
import { ProjectServicePort } from '../../infrastructure/ports/project-service.port';
import { AcceptInvitationResponse } from '@app/common/generated/invitation';
import { normalizeEmail } from '@app/common/utils/email.util';
import { InvitationTargetType, TUTOR_ROLE_ID } from '../../domain/entities/invitation.entity';

@Injectable()
export class AcceptInvitationUseCase {

  constructor(
    private readonly invitationRepository: InvitationRepositoryPort,
    private readonly invitationRoleRepository: InvitationRoleRepositoryPort,
    private readonly authService: AuthServicePort,
    private readonly eventService: EventServicePort,
    private readonly projectService: ProjectServicePort,
  ) { }

  async execute(dto: AcceptInvitationDto): Promise<AcceptInvitationResponse> {
    const invitation = await this.invitationRepository.findByToken(dto.token);

    if (!invitation || !invitation.canBeAccepted()) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'La invitación no se puede aceptar',
      });
    }

    // We only update the microsftToken or password here if the user is PENDING
    const invitedUser = await this.authService.getUser(invitation.invitedUserId);
    if (invitedUser.status === 'PENDING') {
      // Validate that PENDING users provide authentication credentials
      if (!dto.password && !dto.microsoftToken) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'Para activar un usuario nuevo se requiere una contraseña o el token de Microsoft',
        });
      }

      if (dto.password) {
        await this.authService.activateUser({
          userId: invitation.invitedUserId,
          password: dto.password,
        });
      } else if (dto.microsoftToken) {
        await this.authService.activateUserWithMicrosoft({
          userId: invitation.invitedUserId,
          token: dto.microsoftToken,
        });
      }


      // After activation, update the user's profile if name is provided
      if (dto.firstName || dto.lastName) {
        await this.authService.updateUser({
          id: invitation.invitedUserId,
          firstName: dto.firstName,
          lastName: dto.lastName,
        });
      }
    }
    // Fetch the role IDs associated with this invitation
    const invitationRoles = await this.invitationRoleRepository.findByInvitationId(invitation.id);
    const roleIds = invitationRoles.map((ir) => ir.roleId);

    // Orchestrate resource membership based on target type
    switch (invitation.targetType) {
      case InvitationTargetType.PLATFORM:
        // Assign platform roles to the user
        if (roleIds.length > 0) {
          await this.authService.assignPlatformRoles({
            userId: invitation.invitedUserId,
            roleIds,
          });
        }
        break;

      case InvitationTargetType.EVENT:
        for (const roleId of roleIds) {
          await this.eventService.createEventMember({
            eventId: invitation.targetId,
            userId: invitation.invitedUserId,
            roleId,
          });
        }
        break;

      case InvitationTargetType.PROJECT:
        // Get project to find eventId
        const project = await this.projectService.getProject(invitation.targetId);

        if (!project) {
          throw new RpcException({
            code: status.NOT_FOUND,
            message: `No se encontró el proyecto con ID ${invitation.targetId}`,
          });
        }

          const pendingParticipants = await this.projectService.listPendingParticipants(
            invitation.targetId,
          );

          const studentCode = pendingParticipants.find(
            (participant) =>
              normalizeEmail(participant.email) ===
              normalizeEmail(invitation.email),
          )?.studentCode?.trim();

          if (!studentCode) {
            throw new RpcException({
              code: status.INVALID_ARGUMENT,
              message: 'No se pudo obtener el código de estudiante de los participantes pendientes de esta invitación',
            });
          }

        // Add as project participant
        await this.projectService.addParticipant({
          userId: invitation.invitedUserId,
          projectId: invitation.targetId,
            studentCode,
        });

        // Once the user is a project participant, assign event roles
        // This makes sense. If the role is participant, the method makes
        // a validation to check if the user is part of a project
        for (const roleId of roleIds) {
          await this.eventService.createEventMember({
            eventId: project.eventId,
            userId: invitation.invitedUserId,
            roleId,
          });
        }

        break;

      case InvitationTargetType.PROJECT_TUTOR:
        // Link first: a tutor removed from the project after the invitation is rejected here
        // and does not get the role
        await this.projectService.addProjectTutor({
          projectId: invitation.targetId,
          userId: invitation.invitedUserId,
          email: invitation.email,
        });
        // Additive: the Tutor role is added to the roles the user already has
        await this.authService.assignPlatformRoles({
          userId: invitation.invitedUserId,
          roleIds: [TUTOR_ROLE_ID],
        });
        break;
    }

    // Mark invitation as accepted
    invitation.accept(invitation.invitedUserId);
    await this.invitationRepository.save(invitation);

    return { success: true };
  }
}
