import { Injectable, Logger } from '@nestjs/common';
import { InvitationRepositoryPort } from '../../domain/repositories/invitation.repository.port';
import { Invitation } from '../../domain/entities/invitation.entity';
import { InvitationRoleRepositoryPort } from '../../domain/repositories/invitation-role.repository.port';
import { InvitationRole } from '../../domain/entities/invitation-role.entity';
import {
  EmailStatus,
  NotificationServicePort,
  invitationEmailKey,
} from '../../infrastructure/ports/notification-service.port';

interface ListEventInvitationsDto {
    eventId: number;
    page: number;
    limit: number;
    roleId?: number;
}

@Injectable()
export class ListEventInvitationsUseCase {
    private readonly logger = new Logger(ListEventInvitationsUseCase.name);

    constructor(
        private readonly invitationRepository: InvitationRepositoryPort,
        private readonly invitationRoleRepository: InvitationRoleRepositoryPort,
        private readonly notificationService: NotificationServicePort,
    ) { }

    async execute(dto: ListEventInvitationsDto): Promise<{
        invitations: Invitation[];
        total: number;
        roles: InvitationRole[];
        emailStatuses: Map<string, EmailStatus>;
    }> {
        const { invitations, total } = await this.invitationRepository.findByEventId(dto.eventId, dto.page, dto.limit, dto.roleId);

        const invitationIds = invitations.map(inv => inv.id);
        const roles = await this.invitationRoleRepository.findByInvitationIds(invitationIds);

        const emailStatuses = await this.findEmailStatuses(invitations);

        return { invitations, total, roles, emailStatuses };
    }

    /**
     * Email status by invitation id. Invitations without a recorded delivery
     * are absent. The list does not depend on the email: if notification-service
     * fails, it returns an empty map.
     */
    private async findEmailStatuses(invitations: Invitation[]): Promise<Map<string, EmailStatus>> {
        const statuses = new Map<string, EmailStatus>();
        if (invitations.length === 0) return statuses;

        try {
            const byKey = await this.notificationService.getEmailStatuses(
                invitations.map(inv => invitationEmailKey(inv.id, inv.expiresAt)),
            );
            for (const inv of invitations) {
                const status = byKey.get(invitationEmailKey(inv.id, inv.expiresAt));
                if (status) statuses.set(inv.id, status);
            }
        } catch (err) {
            this.logger.warn(`Could not load email statuses: ${(err as Error).message}`);
        }
        return statuses;
    }
}
