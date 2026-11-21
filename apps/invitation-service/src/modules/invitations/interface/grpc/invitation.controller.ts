import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreateInvitationUseCase } from '../../application/use-cases/create-invitation.use-case';
import { GetInvitationByTokenUseCase } from '../../application/use-cases/get-invitation-by-token.use-case';
import { AcceptInvitationUseCase } from '../../application/use-cases/accept-invitation.use-case';
import { RejectInvitationUseCase } from '../../application/use-cases/reject-invitation.use-case';
import { FindPendingByEmailUseCase } from '../../application/use-cases/find-pending-by-email.use-case';
import { CreateInvitationDto } from '../../application/dto/create-invitation.dto';
import { GetInvitationByTokenDto } from '../../application/dto/get-invitation-by-token.dto';
import { AcceptInvitationDto } from '../../application/dto/accept-invitation.dto';
import { RejectInvitationDto } from '../../application/dto/reject-invitation.dto';
import { FindPendingByEmailDto } from '../../application/dto/find-pending-by-email.dto';
import { GetEventInvitationsDto } from '../../application/dto/get-event-invitations.dto';
import { ResendInvitationDto } from '../../application/dto/resend-invitation.dto';
import { GetUserInvitationsDto } from '../../application/dto/get-user-invitations.dto';
import {
  GetInvitationByTokenResponse,
  Invitation,
  FindPendingByEmailResponse,
  GetEventInvitationsResponse,
  ResendInvitationResponse,
  GetUserInvitationsResponse
} from '@app/common/generated/invitation';
import { InvitationMapper } from '../../application/mappers/invitation.mapper';
import { ListEventInvitationsUseCase } from '../../application/use-cases/list-event-invitations.use-case';
import { ResendInvitationUseCase } from '../../application/use-cases/resend-invitation.use-case';
import { ListUserInvitationsUseCase } from '../../application/use-cases/list-user-invitations.use-case';
import { AuthorizeInvitationUseCase } from '../../application/use-cases/authorize-invitation.use-case';
import { AuthorizeInvitationDto } from '../../application/dto/authorize-invitation.dto';

const INVITATION_SERVICE_NAME = 'InvitationService';

@Controller()
export class InvitationController {
  constructor(
    private readonly createInvitationUseCase: CreateInvitationUseCase,
    private readonly getInvitationByTokenUseCase: GetInvitationByTokenUseCase,
    private readonly acceptInvitationUseCase: AcceptInvitationUseCase,
    private readonly rejectInvitationUseCase: RejectInvitationUseCase,
    private readonly findPendingByEmailUseCase: FindPendingByEmailUseCase,
    private readonly listEventInvitationsUseCase: ListEventInvitationsUseCase,
    private readonly resendInvitationUseCase: ResendInvitationUseCase,
    private readonly listUserInvitationsUseCase: ListUserInvitationsUseCase,
    private readonly authorizeInvitationUseCase: AuthorizeInvitationUseCase,
  ) { }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'AuthorizeInvitation')
  async authorizeInvitation(request: AuthorizeInvitationDto): Promise<{ allowed: boolean }> {
    await this.authorizeInvitationUseCase.execute({
      ...request,
      roleIds: request.roleIds ?? [],
    });
    return { allowed: true };
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'CreateInvitation')
  async createInvitation(request: CreateInvitationDto): Promise<Invitation> {
    const { invitation, invitationRoles } = await this.createInvitationUseCase.execute(request);
    return InvitationMapper.toProto(invitation, invitationRoles);;
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'GetInvitationByToken')
  async getInvitationByToken(
    request: GetInvitationByTokenDto,
  ): Promise<GetInvitationByTokenResponse> {
    return await this.getInvitationByTokenUseCase.execute(request);
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'AcceptInvitation')
  async acceptInvitation(request: AcceptInvitationDto): Promise<{ success: boolean }> {
    return await this.acceptInvitationUseCase.execute(request);
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'RejectInvitation')
  async rejectInvitation(request: RejectInvitationDto): Promise<{ success: boolean }> {
    return await this.rejectInvitationUseCase.execute(request);
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'FindPendingByEmail')
  async findPendingByEmail(request: FindPendingByEmailDto): Promise<FindPendingByEmailResponse> {
    return await this.findPendingByEmailUseCase.execute(request);
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'GetEventInvitations')
  async getEventInvitations(request: GetEventInvitationsDto): Promise<GetEventInvitationsResponse> {
    const { invitations, total, roles, emailStatuses } = await this.listEventInvitationsUseCase.execute(request);
    return InvitationMapper.toGetEventInvitationsResponse(
      invitations,
      total,
      request.page,
      request.limit,
      roles,
      emailStatuses,
    );
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'ResendInvitation')
  async resendInvitation(request: ResendInvitationDto): Promise<ResendInvitationResponse> {
    const success = await this.resendInvitationUseCase.execute(request.invitationId);
    return { success };
  }

  @GrpcMethod(INVITATION_SERVICE_NAME, 'GetUserInvitations')
  async getUserInvitations(request: GetUserInvitationsDto): Promise<GetUserInvitationsResponse> {
    const { invitations, total, roles } = await this.listUserInvitationsUseCase.execute(request);
    return InvitationMapper.toGetUserInvitationsResponse(
      invitations,
      total,
      request.page,
      request.limit,
      roles,
    );
  }
}