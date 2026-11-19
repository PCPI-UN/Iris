import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { INVITATION_SERVICE_NAME, InvitationServiceClient } from '@app/common/generated/invitation';
import { InvitationCommandPort } from '../../application/ports/invitation.command-port';

// Same placeholder the participants flow uses for the sender; the tutor invitation has no real sender yet
const SYSTEM_SENDER_ID = 1;

@Injectable()
export class InvitationServiceAdapter implements InvitationCommandPort, OnModuleInit {
  private svc: InvitationServiceClient;

  constructor(@Inject(INVITATION_SERVICE_NAME) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<InvitationServiceClient>('InvitationService');
  }

  async createInvitation(input: Parameters<InvitationCommandPort['createInvitation']>[0]) {
    const invitation = await lastValueFrom(
      this.svc.createInvitation({
        email: input.email,
        targetType: input.targetType,
        targetId: input.targetId,
        invitedByUserId: input.requestedByUserId ?? SYSTEM_SENDER_ID,
        roleIds: input.roleIds ?? [],
        firstName: input.firstName,
        lastName: input.lastName,
        eventType: input.eventType ?? '',
      }),
    );
    return { created: true, invitationId: invitation.id };
  }
}
