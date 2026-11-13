import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { randomUUID } from 'crypto';
import { InvitationRepositoryPort } from '../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../domain/repositories/invitation-role.repository.port';
import { NotificationServicePort } from '../../infrastructure/ports/notification-service.port';
import { AuthServicePort } from '../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../infrastructure/ports/event-service.port';
import { ProjectServicePort } from '../../infrastructure/ports/project-service.port';
import { Invitation, InvitationTargetType, InvitationStatus } from '../../domain/entities/invitation.entity';
import { InvitationRole } from '../../domain/entities/invitation-role.entity';

@Injectable()
export class ResendInvitationUseCase {
    constructor(
        private readonly invitationRepository: InvitationRepositoryPort,
        private readonly invitationRoleRepository: InvitationRoleRepositoryPort,
        private readonly authService: AuthServicePort,
        private readonly eventService: EventServicePort,
        private readonly projectService: ProjectServicePort,
        private readonly notificationService: NotificationServicePort,
        private readonly configService: ConfigService,
    ) { }

    async execute(invitationId: string): Promise<boolean> {
        const invitation = await this.invitationRepository.findById(invitationId);

        if (!invitation) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: 'No se encontró la invitación',
            });
        }

        if (invitation.status !== InvitationStatus.EXPIRED && invitation.status !== InvitationStatus.PENDING) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: 'Solo se pueden reenviar invitaciones expiradas o pendientes',
            });
        }

        // Check if user has already accepted an invitation for this target
        const acceptedInvitation = await this.invitationRepository.findAcceptedByEmailAndTargetType(
            invitation.email,
            invitation.targetType,
            invitation.targetId,
        );

        if (acceptedInvitation) {
            const targetName = invitation.targetType === InvitationTargetType.EVENT
                ? 'event'
                : invitation.targetType === InvitationTargetType.PROJECT ||
                    invitation.targetType === InvitationTargetType.PROJECT_TUTOR
                    ? 'project'
                    : 'platform';

            throw new RpcException({
                code: status.ALREADY_EXISTS,
                message: `El usuario ya aceptó una invitación para este ${targetName}`,
            });
        }

        // Get user details
        let user;
        try {
            user = await this.authService.getUserByEmail(invitation.email);
        } catch (error) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: 'No se encontró el usuario para reenviar la invitación',
            });
        }

        // Fetch invitation roles to preserve them
        const invitationRoles = await this.invitationRoleRepository.findByInvitationId(invitation.id);

        const expiresInSeconds = this.configService.get<number>(
            'INVITATION_EXPIRATION_SECONDS',
            2 * 24 * 60 * 60 // 2 days
        );

        let newInvitation: Invitation;
        let token: string;
        let expiresAt: Date;
        const now = new Date();

        // Check if user is PENDING (hasn't set up their account yet)
        const isPendingUser = user.status === 'PENDING';

        if (isPendingUser) {
            // For PENDING users: Create new invitation with new ACCOUNT_SETUP token
            
            // 1. Mark old invitation as EXPIRED
            invitation.status = InvitationStatus.EXPIRED;
            await this.invitationRepository.save(invitation);

            // 2. Generate new ACCOUNT_SETUP token (old ones automatically invalidated)
            const accountSetupToken = await this.authService.generateAccountSetupToken(user.id);
            token = accountSetupToken.token;
            expiresAt = accountSetupToken.expiresAt;

            // 3. Create new invitation record with new token
            newInvitation = new Invitation(
                randomUUID(),
                token,
                invitation.email,
                invitation.targetType,
                invitation.targetId,
                InvitationStatus.PENDING,
                expiresAt,
                invitation.invitedByUserId,
                invitation.invitedUserId,
                now,
                now,
            );

            await this.invitationRepository.save(newInvitation);

            // 4. Preserve invitation roles
            for (const invitationRole of invitationRoles) {
                const newRole = new InvitationRole(newInvitation.id, invitationRole.roleId);
                await this.invitationRoleRepository.save(newRole);
            }
        } else {
            // For CONFIRMED users: Just update expiration (they accept via dashboard)
            invitation.expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
            invitation.status = InvitationStatus.PENDING;
            await this.invitationRepository.save(invitation);
            
            newInvitation = invitation;
            token = invitation.token;
        }

        // Fetch data for email
        let eventData: any = null;
        let projectData: any = null;

        if (invitation.targetType === InvitationTargetType.EVENT) {
            eventData = await this.eventService.getEvent(invitation.targetId);
        } else if (invitation.targetType === InvitationTargetType.PROJECT_TUTOR) {
            projectData = await this.projectService.getProject(invitation.targetId);
        } else if (invitation.targetType === InvitationTargetType.PROJECT) {
            projectData = await this.projectService.getProject(invitation.targetId);
            eventData = await this.eventService.getEvent(projectData.eventId);
        }

        const frontendUrl = this.configService.get<string>('FRONTEND_URL');
        let invitationLink = '';
        if (user.status === 'PENDING')
            invitationLink = `${frontendUrl}/auth/chg-password?token=${token}`;
        else // The user already exists and therefore they can accept invitations in the dashboard
            invitationLink = `${frontendUrl}/app/invitations`;

        await this.sendInvitationEmail({
            targetType: invitation.targetType,
            to: invitation.email,
            firstName: user?.firstName || '',
            lastName: user?.lastName,
            invitationLink,
            roleIds: [],
            eventData,
            projectData,
        });

        return true;
    }

    private async sendInvitationEmail(params: {
        targetType: InvitationTargetType;
        eventType?: string;
        to: string;
        firstName: string;
        lastName?: string;
        invitationLink: string;
        roleIds: number[];
        eventData: any;
        projectData: any;
    }): Promise<void> {
        // Reuse the logic from CreateInvitationUseCase or similar
        switch (params.targetType) {
            case InvitationTargetType.PLATFORM: {
                // TODO: For now, we are not fetching roles, so we are sending an empty string.
                await this.notificationService.sendPlatformInvitationEmail({
                    to: params.to,
                    firstName: params.firstName,
                    lastName: params.lastName,
                    invitationLink: params.invitationLink,
                    roles: '',
                });
                break;
            }

            case InvitationTargetType.PROJECT_TUTOR: {
                await this.notificationService.sendProjectTutorInvitationEmail({
                    to: params.to,
                    firstName: params.firstName,
                    lastName: params.lastName,
                    invitationLink: params.invitationLink,
                    projectName: params.projectData?.name || 'Project',
                });
                break;
            }

            case InvitationTargetType.EVENT: {
                await this.notificationService.sendJurorInvitationEmail({
                    to: params.to,
                    firstName: params.firstName,
                    lastName: params.lastName,
                    invitationLink: params.invitationLink,
                    eventName: params.eventData?.name || 'Event',
                    eventDescription: params.eventData?.description || '',
                    roles: 'Jurado',
                });
                break;
            }

            case InvitationTargetType.PROJECT: {
                await this.notificationService.sendProjectSubmittedInvitationEmail({
                    to: params.to,
                    eventType: params.eventData?.eventType || 'Exposition',
                    firstName: params.firstName,
                    lastName: params.lastName,
                    invitationLink: params.invitationLink,
                    projectName: params.projectData?.name || 'Project',
                    eventName: params.eventData?.name || 'Event',
                });
                break;
            }
        }
    }
}
