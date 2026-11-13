import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { GetInvitationByTokenDto } from '../dto/get-invitation-by-token.dto';
import { InvitationRepositoryPort } from '../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../domain/repositories/invitation-role.repository.port';
import { AuthServicePort } from '../../infrastructure/ports/auth-service.port';
import { GetInvitationByTokenResponse } from '@app/common/generated/invitation';

@Injectable()
export class GetInvitationByTokenUseCase {
  constructor(
    private readonly invitationRepository: InvitationRepositoryPort,
    private readonly invitationRoleRepository: InvitationRoleRepositoryPort,
    private readonly authService: AuthServicePort,
  ) {}

  async execute(
    dto: GetInvitationByTokenDto,
  ): Promise<GetInvitationByTokenResponse> {
    const invitation = await this.invitationRepository.findByToken(dto.token);

    if (!invitation || !invitation.canBeAccepted()) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró la invitación o no es válida',
      });
    }

    if (!invitation.invitedUserId) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'La invitación no tiene un usuario válido.',
      });
    }

    const user = await this.authService.getUser(invitation.invitedUserId);

    // Fetch invitation roles
    const invitationRoles = await this.invitationRoleRepository.findByInvitationId(invitation.id);
    const roleIds = invitationRoles.map(ir => ir.roleId);

    return {
      email: user.email,
      userStatus: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      roleIds,
    };
  }
}