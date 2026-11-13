import { Injectable } from '@nestjs/common';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { DeactivateUserDto } from '../dto/deactivate-user.dto';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AccountAdministrationPolicy } from '@roles/application/services/account-administration.policy';

@Injectable()
export class DeactivateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly administrationPolicy: AccountAdministrationPolicy,
  ) {}

  async execute({ id, actorUserId }: DeactivateUserDto): Promise<{ success: boolean }> {
    const userExists = await this.userRepository.findById(id);
    if (!userExists) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el usuario con ID #${id}`,
      });
    }

    // IRIS-V3-ADM-02: only the principal administrator deactivates administrators,
    // nobody deactivates their own account and the last Admin is never deactivated
    const actor = await this.administrationPolicy.loadActor(actorUserId);
    this.administrationPolicy.assertNotSelf(actor, id, 'desactivar');
    const targetRoles = await this.administrationPolicy.assertCanManageAccount(actor, id);
    await this.administrationPolicy.assertKeepsAnAdmin(id, targetRoles);

    await this.userRepository.deactivate(id);

    return { success: true };
  }
}
