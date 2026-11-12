import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { randomUUID } from 'crypto';
import { CreateInvitationDto } from '../dto/create-invitation.dto';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../domain/entities/invitation.entity';
import { InvitationRepositoryPort } from '../../domain/repositories/invitation.repository.port';
import { InvitationRole } from '../../domain/entities/invitation-role.entity';
import { InvitationRoleRepositoryPort } from '../../domain/repositories/invitation-role.repository.port';
import { NotificationServicePort } from '../../infrastructure/ports/notification-service.port';
import { ProjectServicePort } from '../../infrastructure/ports/project-service.port';
import { AuthServicePort } from '../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../infrastructure/ports/event-service.port';
import { normalizeEmail } from '@app/common/utils/email.util';

@Injectable()
export class CreateInvitationUseCase {
  constructor(
    private readonly invitationRepository: InvitationRepositoryPort,
    private readonly invitationRoleRepository: InvitationRoleRepositoryPort,
    private readonly authService: AuthServicePort,
    private readonly eventService: EventServicePort,
    private readonly projectService: ProjectServicePort,
    private readonly notificationService: NotificationServicePort,
    private readonly configService: ConfigService,
  ) { }

  async execute(dto: CreateInvitationDto): Promise<{ invitation: Invitation; invitationRoles: InvitationRole[] }> {
    const {
      email: rawEmail,
      eventType,
      firstName,
      lastName,
      roleIds,
      ...rest
    } = dto;
    const email = normalizeEmail(rawEmail);
    // Step 1: Check for existing accepted invitation
    const acceptedInvitation = await this.invitationRepository.findAcceptedByEmailAndTargetType(
      email,
      rest.targetType,
      rest.targetId,
    );

    if (acceptedInvitation) {
      const targetName = rest.targetType === InvitationTargetType.EVENT
        ? 'event'
        : rest.targetType === InvitationTargetType.PROJECT ||
            rest.targetType === InvitationTargetType.PROJECT_TUTOR
          ? 'project'
          : 'platform';

      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: `User has already accepted an invitation for this ${targetName}`,
      });
    }

    // Step 2: Check for existing pending invitation (idempotent behavior)
    const existingInvitation = await this.invitationRepository.findPendingByEmailAndTargetType(
      email,
      rest.targetType,
      rest.targetId,
    );

    if (existingInvitation) {
      // Return existing invitation with its roles
      const existingRoles = await this.invitationRoleRepository.findByInvitationId(
        existingInvitation.id,
      );
      return { invitation: existingInvitation, invitationRoles: existingRoles };
    }

    // Step 3: Validate target exists and fetch data (to avoid duplicate calls later)
    let eventData: any = null;
    let projectData: any = null;

    switch (rest.targetType) {
      case InvitationTargetType.EVENT:
        try {
          eventData = await this.eventService.getEvent(rest.targetId);
          if (!eventData) {
            throw new RpcException({
              code: status.NOT_FOUND,
              message: `Event with ID ${rest.targetId} not found`,
            });
          }
        } catch (error) {
          // Re-throw as RpcException with proper code
          throw new RpcException({
            code: error.code || status.INTERNAL,
            message: error.details || error.message || `Event with ID ${rest.targetId} not found`,
          });
        }
        break;

      case InvitationTargetType.PROJECT:
        try {
          projectData = await this.projectService.getProject(rest.targetId);
          if (!projectData) {
            throw new RpcException({
              code: status.NOT_FOUND,
              message: `Project with ID ${rest.targetId} not found`,
            });
          }

          // Also fetch the event for the project
          eventData = await this.eventService.getEvent(projectData.eventId);
          if (!eventData) {
            throw new RpcException({
              code: status.NOT_FOUND,
              message: `Event with ID ${projectData.eventId} not found`,
            });
          }
        } catch (error) {
          // Re-throw as RpcException with proper code
          throw new RpcException({
            code: error.code || status.INTERNAL,
            message: error.details || error.message || `Project with ID ${rest.targetId} not found`,
          });
        }
        break;

      case InvitationTargetType.PROJECT_TUTOR:
        try {
          projectData = await this.projectService.getProject(rest.targetId);
          if (!projectData) {
            throw new RpcException({
              code: status.NOT_FOUND,
              message: `Project with ID ${rest.targetId} not found`,
            });
          }
        } catch (error) {
          throw new RpcException({
            code: error.code || status.INTERNAL,
            message: error.details || error.message || `Project with ID ${rest.targetId} not found`,
          });
        }
        break;

      case InvitationTargetType.PLATFORM:
        // No validation needed for platform invitations
        break;

      default:
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Invalid target type: ${rest.targetType}`,
        });
    }

    let user;
    try {
      user = await this.authService.getUserByEmail(email);
    } catch (error) {
      if (error.code === status.NOT_FOUND) {
        user = await this.authService.createBasicUser({
          email,
          firstName: firstName || email.split('@')[0],
          lastName,
        });
      } else {
        throw error;
      }
    }


    const expiresInSeconds = this.configService.get<number>(
      'INVITATION_EXPIRATION_SECONDS',
      2 * 24 * 60 * 60 // 2 days by default!
    );

    // Step 4: Create invitation record
    let token: string;
    let expiresAt: Date;
    const now = new Date();

    // Check if user is new (PENDING status means they haven't set up their account)
    const isNewUser = user.status === 'PENDING';

    if (isNewUser) {
      // For NEW users: Generate ACCOUNT_SETUP token via auth-service
      // This token will be stored in BOTH user_tokens and invitations tables
      const accountSetupToken = await this.authService.generateAccountSetupToken(user.id);
      token = accountSetupToken.token;
      expiresAt = accountSetupToken.expiresAt;
    } else {
      // For EXISTING users: Generate random UUID (existing behavior)
      // This token is ONLY stored in invitations table
      token = randomUUID();
      expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    }

    const invitation = new Invitation(
      randomUUID(),
      token,
      email,
      rest.targetType,
      rest.targetId,
      InvitationStatus.PENDING,
      expiresAt,
      rest.invitedByUserId,
      user.id,
      now,
      now,
    );

    const savedInvitation = await this.invitationRepository.save(invitation);

    // Step 5: Save invitation roles
    const savedInvitationRoles: InvitationRole[] = [];
    if (roleIds && roleIds.length > 0) {
      const invitationRoles = roleIds.map(
        (roleId) => new InvitationRole(savedInvitation.id, roleId),
      );
      for (const invitationRole of invitationRoles) {
        const saved = await this.invitationRoleRepository.save(invitationRole);
        savedInvitationRoles.push(saved);
      }
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    let invitationLink = '';
    if (user.status === 'PENDING')
      invitationLink = `${frontendUrl}/auth/chg-password?token=${invitation.token}`;
    else // The user already exist and therefore they can accept invitations in the dashboard
      invitationLink = `${frontendUrl}/app/invitations`;

    await this.sendInvitationEmail({
      targetType: rest.targetType,
      eventType,
      to: email,
      firstName: user.firstName,
      lastName: user.lastName,
      invitationLink,
      roleIds: roleIds || [],
      eventData,
      projectData,
    });

    return { invitation: savedInvitation, invitationRoles: savedInvitationRoles };
  }

  /**
   * Sends invitation email based on target type using already-fetched data
   */
  private async sendInvitationEmail(params: {
    targetType: InvitationTargetType;
    eventType: string;
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    roleIds: number[];
    eventData: any;
    projectData: any;
  }): Promise<void> {
    switch (params.targetType) {
      // A project tutor has no dedicated template yet: they get the platform
      // invitation email with the roles of the invitation (Tutor)
      case InvitationTargetType.PROJECT_TUTOR:
      case InvitationTargetType.PLATFORM: {
        // Fetch role names if provided
        let roles = '';
        if (params.roleIds.length > 0) {
          const rolesResponse = await this.authService.getRolesByIds(params.roleIds);
          roles = rolesResponse.roles.map((role) => role.name).join(', ');
        }

        await this.notificationService.sendPlatformInvitationEmail({
          to: params.to,
          firstName: params.firstName,
          lastName: params.lastName,
          invitationLink: params.invitationLink,
          roles,
        });
        break;
      }

      case InvitationTargetType.EVENT: {
        // NOTE: EVENT invitations use JUROR_INVITATION template
        // This is because currently just jurors receive event invitations
        await this.notificationService.sendJurorInvitationEmail({
          to: params.to,
          firstName: params.firstName,
          lastName: params.lastName,
          invitationLink: params.invitationLink,
          eventName: params.eventData.name,
          eventDescription: params.eventData.description || '',
          roles: 'Jurado',
        });
        break;
      }

      case InvitationTargetType.PROJECT: {
        await this.notificationService.sendProjectSubmittedInvitationEmail({
          to: params.to,
          eventType: params.eventType,
          firstName: params.firstName,
          lastName: params.lastName,
          invitationLink: params.invitationLink,
          projectName: params.projectData.name,
          eventName: params.eventData.name,
        });
        break;
      }

      default:
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Unsupported invitation target type: ${params.targetType}`,
        });
    }
  }
}
