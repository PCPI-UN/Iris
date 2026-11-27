import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { mapWithConcurrency } from '@app/common/utils/concurrency.util';
import { status } from '@grpc/grpc-js';
import {
  INVITATION_SERVICE_NAME,
  InvitationServiceClient,
  InvitationTargetType,
} from '@app/common/generated/invitation';
import {
  AUTH_SERVICE_NAME,
  AuthServiceClient,
  Role,
} from '@app/common/generated/auth';
import { EventServiceClient, EVENT_SERVICE_NAME } from '@app/common/generated/event';
import { ProjectsServiceClient, PROJECTS_SERVICE_NAME } from '@app/common/generated/project';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ConfigService } from '@nestjs/config';
import { InvitationWithRolesResponseDto } from './dto/invitation-with-roles-response.dto';
import { GetInvitationByTokenWithRolesResponseDto } from './dto/get-invitation-by-token-response.dto';
import { InviteJurorToEventDto } from './dto/invite-juror-to-event.dto';

/** A juror to invite to an event, with the name to use if the account has to be created */
export interface JurorInvitee {
  email: string;
  firstName: string;
  lastName?: string;
}

/** Outcome of inviting several jurors to an event, by email */
export interface JurorInvitationsResult {
  /** A new invitation was created and its email sent */
  sent: string[];
  /** They already had a pending invitation to the event: no new email */
  reused: string[];
  /** The invitation could not be created */
  failed: { email: string; message: string }[];
}

const JUROR_INVITATION_CONCURRENCY = 10;

/** The message of a failed gRPC call: RpcException, gRPC error or plain Error */
const grpcErrorMessage = (error: unknown): string => {
  const e = error as {
    details?: string;
    message?: string;
    getError?: () => unknown;
  };
  const rpc = e?.getError?.() as { message?: string } | string | undefined;
  return (
    (typeof rpc === 'string' ? rpc : rpc?.message) ||
    e?.details ||
    e?.message ||
    'error inesperado'
  );
};

@Injectable()
export class InvitationsService implements OnModuleInit {
  private invitationService: InvitationServiceClient;
  private authService: AuthServiceClient;
  private eventService: EventServiceClient;
  private projectService: ProjectsServiceClient;

  constructor(
    @Inject(INVITATION_SERVICE_NAME) private readonly invitationClient: ClientGrpc,
    @Inject(AUTH_SERVICE_NAME) private readonly authClient: ClientGrpc,
    @Inject(EVENT_SERVICE_NAME) private readonly eventClient: ClientGrpc,
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectClient: ClientGrpc,
    private readonly configService: ConfigService,
  ) { }

  onModuleInit() {
    this.invitationService = this.invitationClient.getService<InvitationServiceClient>(
      INVITATION_SERVICE_NAME,
    );
    this.authService = this.authClient.getService<AuthServiceClient>(
      AUTH_SERVICE_NAME,
    );
    this.eventService = this.eventClient.getService<EventServiceClient>(EVENT_SERVICE_NAME);
    this.projectService = this.projectClient.getService<ProjectsServiceClient>(PROJECTS_SERVICE_NAME);
  }

  async createInvitation(dto: CreateInvitationDto, invitedByUserId: number): Promise<InvitationWithRolesResponseDto> {
    // invitation-service decides whether the caller may create this invitation (403 otherwise)
    await firstValueFrom(
      this.invitationService.authorizeInvitation({
        inviterUserId: invitedByUserId,
        email: dto.email,
        targetType: dto.targetType as unknown as string,
        targetId: dto.targetId,
        roleIds: dto.roleIds ?? [],
      }),
    );

    const invitation = await firstValueFrom(
      this.invitationService.createInvitation({
        ...dto,
        invitedByUserId,
        roleIds: dto.roleIds ?? [],
        targetType: dto.targetType as unknown as string, // Cast to string if needed by proto
      }),
    );

    const roles: Role[] = [];
    if (invitation.roleIds && invitation.roleIds.length > 0) {
      const rolesResponse = await firstValueFrom(
        this.authService.getRolesByIds({ roleIds: invitation.roleIds }),
      );
      roles.push(...rolesResponse.roles);
    }

    return {
      id: invitation.id,
      token: invitation.token,
      email: invitation.email,
      targetType: invitation.targetType as unknown as number,
      targetId: invitation.targetId,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      invitedByUserId: invitation.invitedByUserId,
      invitedUserId: invitation.invitedUserId,
      roles,
      createdAt: invitation.createdAt,
    };
  }

  async getInvitationByToken(token: string): Promise<GetInvitationByTokenWithRolesResponseDto> {
    const invitationInfo = await firstValueFrom(
      this.invitationService.getInvitationByToken({ token }),
    );

    const roles: Role[] = [];
    if (invitationInfo.roleIds && invitationInfo.roleIds.length > 0) {
      const rolesResponse = await firstValueFrom(
        this.authService.getRolesByIds({ roleIds: invitationInfo.roleIds }),
      );
      roles.push(...rolesResponse.roles);
    }

    return {
      email: invitationInfo.email,
      userStatus: invitationInfo.userStatus,
      firstName: invitationInfo.firstName,
      lastName: invitationInfo.lastName,
      roles,
    };
  }

  acceptInvitation(acceptInvitationDto: AcceptInvitationDto) {
    return firstValueFrom(
      this.invitationService.acceptInvitation(acceptInvitationDto),
    );
  }

  async inviteJurorToEvent(
    eventId: number,
    dto: InviteJurorToEventDto,
    invitedByUserId: number,
  ): Promise<InvitationWithRolesResponseDto> {
    // Get the Juror role from auth-service
    const rolesResponse = await firstValueFrom(
      this.authService.getRoles({}),
    );

    const jurorRole = rolesResponse.roles.find(
      (role) => role.name === 'Juror' && role.scope === 'EVENT',
    );

    if (!jurorRole) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró el rol de jurado en el sistema',
      });
    }

    // Create invitation (service handles duplicate checking)
    const invitation = await firstValueFrom(
      this.invitationService.createInvitation({
        email: dto.email,
        eventType: dto.eventType,
        firstName: dto.firstName,
        lastName: dto.lastName,
        targetType: InvitationTargetType[InvitationTargetType.EVENT],
        targetId: eventId,
        invitedByUserId,
        roleIds: [jurorRole.id],
      }),
    );

    const roles: Role[] = [];
    if (invitation.roleIds && invitation.roleIds.length > 0) {
      const rolesResponse = await firstValueFrom(
        this.authService.getRolesByIds({ roleIds: invitation.roleIds }),
      );
      roles.push(...rolesResponse.roles);
    }

    return {
      id: invitation.id,
      token: invitation.token,
      email: invitation.email,
      targetType: invitation.targetType as unknown as number,
      targetId: invitation.targetId,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      invitedByUserId: invitation.invitedByUserId,
      invitedUserId: invitation.invitedUserId,
      roles,
      createdAt: invitation.createdAt,
    };
  }

  /**
   * Invites several jurors to an event at once. The Juror role is looked up once for all of them.
   * A juror who already has a pending invitation to the event gets no new email; if that invitation
   * lacks the Juror role, it is added to it. A failure is reported per juror and does not stop the
   * others.
   */
  async inviteJurorsToEvent(
    eventId: number,
    eventType: string,
    jurors: JurorInvitee[],
    invitedByUserId: number,
  ): Promise<JurorInvitationsResult> {
    const result: JurorInvitationsResult = { sent: [], reused: [], failed: [] };
    if (!jurors.length) return result;
    const jurorRole = await this.findJurorRole();
    const targetType = InvitationTargetType[InvitationTargetType.EVENT];

    await mapWithConcurrency(
      jurors,
      JUROR_INVITATION_CONCURRENCY,
      async (juror) => {
        try {
          // Same lookup CreateInvitation does before reusing a pending invitation
          const pending = await firstValueFrom(
            this.invitationService.findPendingByEmail({
              email: juror.email,
              targetType,
              targetId: eventId,
            }),
          );
          if (pending.invitation) {
            // A pending invitation with other roles (as organizer, say) gets the Juror role
            // added by CreateInvitation, without a new email: otherwise accepting it would
            // leave the juror without the role to evaluate the assigned projects
            if (!(pending.invitation.roleIds ?? []).includes(jurorRole.id)) {
              await firstValueFrom(
                this.invitationService.createInvitation({
                  email: juror.email,
                  eventType,
                  firstName: juror.firstName,
                  lastName: juror.lastName,
                  targetType,
                  targetId: eventId,
                  invitedByUserId,
                  roleIds: [jurorRole.id],
                }),
              );
            }
            result.reused.push(juror.email);
            return;
          }
          await firstValueFrom(
            this.invitationService.createInvitation({
              email: juror.email,
              eventType,
              firstName: juror.firstName,
              lastName: juror.lastName,
              targetType,
              targetId: eventId,
              invitedByUserId,
              roleIds: [jurorRole.id],
            }),
          );
          result.sent.push(juror.email);
        } catch (error) {
          result.failed.push({
            email: juror.email,
            message: grpcErrorMessage(error),
          });
        }
      },
    );
    return result;
  }

  /** The event-scoped Juror role from auth-service */
  private async findJurorRole(): Promise<Role> {
    const rolesResponse = await firstValueFrom(this.authService.getRoles({}));
    const jurorRole = rolesResponse.roles.find(
      (role) => role.name === 'Juror' && role.scope === 'EVENT',
    );
    if (!jurorRole) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Juror role not found in the system',
      });
    }
    return jurorRole;
  }

  async getEventInvitations(
    eventId: number,
    roleId?: number,
    page: number = 1,
    limit: number = 10,
  ) {
    const response = await firstValueFrom(
      this.invitationService.getEventInvitations({
        eventId,
        page,
        limit,
        roleId,
      }),
    );

    if (!response.invitations || response.invitations.length === 0) {
      return {
        invitations: [],
        meta: response.meta,
      };
    }

    // Enrich invitations with roles and target details
    // TODO: We can optimize this by caching the roles and target details
    const enrichedInvitations = await Promise.all(
      response.invitations.map(async (invitation) => {
        const roles: Role[] = [];
        if (invitation.roleIds && invitation.roleIds.length > 0) {
          const rolesResponse = await firstValueFrom(
            this.authService.getRolesByIds({ roleIds: invitation.roleIds }),
          );
          roles.push(...rolesResponse.roles);
        }

        let event = null;
        let project = null;
        let targetType = null;

        // Use generated enum for comparison
        if (invitation.targetType === InvitationTargetType.EVENT) {
          try {
            const eventResponse = await firstValueFrom(
              this.eventService.getEvent({ id: invitation.targetId })
            );
            event = eventResponse.event;
            targetType = 'EVENT';
          } catch (e) {
            console.error(`Failed to fetch event ${invitation.targetId}`, e);
          }
        } else if (invitation.targetType === InvitationTargetType.PROJECT) {
          try {
            const projectResponse = await firstValueFrom(
              this.projectService.getProject({ id: invitation.targetId })
            );
            project = projectResponse.project;

            // Also fetch event for the project
            if (project && project.eventId) {
              const eventResponse = await firstValueFrom(
                this.eventService.getEvent({ id: project.eventId })
              );
              event = eventResponse.event;
            }
            targetType = 'PROJECT';
          } catch (e) {
            console.error(`Failed to fetch project ${invitation.targetId}`, e);
          }
        }

        return {
          ...invitation,
          roles,
          event,
          project,
          targetType,
        };
      }),
    );

    // Fetch event details once
    const eventResponse = await firstValueFrom(
      this.eventService.getEvent({ id: eventId })
    );

    const finalInvitations = enrichedInvitations.map(inv => ({
      ...inv,
      event: eventResponse.event
    }));

    return {
      invitations: finalInvitations,
      meta: response.meta,
    };
  }

  async resendInvitation(invitationId: string) {
    const response = await firstValueFrom(
      this.invitationService.resendInvitation({ invitationId }),
    );
    return response;
  }

  async getUserInvitations(
    userId: number,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const response = await firstValueFrom(
      this.invitationService.getUserInvitations({
        userId,
        status,
        page,
        limit,
      }),
    );
    
    const invitations = response?.invitations ?? []
    // Enrich invitations with roles and target details
    const enrichedInvitations = await Promise.all(
      invitations.map(async (invitation) => {
        const roles: Role[] = [];
        if (invitation.roleIds && invitation.roleIds.length > 0) {
          const rolesResponse = await firstValueFrom(
            this.authService.getRolesByIds({ roleIds: invitation.roleIds }),
          );
          roles.push(...rolesResponse.roles);
        }

        let event = null;
        let project = null;
        let targetType = null;

        // Use generated enum for comparison
        if (invitation.targetType === InvitationTargetType.EVENT) {
          try {
            const eventResponse = await firstValueFrom(
              this.eventService.getEvent({ id: invitation.targetId })
            );
            event = eventResponse.event;
            targetType = 'EVENT';
          } catch (e) {
            console.error(`Failed to fetch event ${invitation.targetId}`, e);
          }
        } else if (invitation.targetType === InvitationTargetType.PROJECT) {
          try {
            const projectResponse = await firstValueFrom(
              this.projectService.getProject({ id: invitation.targetId })
            );
            project = projectResponse.project;

            // Also fetch event for the project
            if (project && project.eventId) {
              const eventResponse = await firstValueFrom(
                this.eventService.getEvent({ id: project.eventId })
              );
              event = eventResponse.event;
            }
            targetType = 'PROJECT';
          } catch (e) {
            console.error(`Failed to fetch project ${invitation.targetId}`, e);
          }
        }

        return {
          ...invitation,
          roles,
          event,
          project,
          targetType,
        };
      }),
    );

    return {
      invitations: enrichedInvitations,
      meta: response.meta,
    };
  }
}
