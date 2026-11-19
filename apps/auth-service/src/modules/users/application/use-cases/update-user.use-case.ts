import { Injectable } from '@nestjs/common';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { UpdateUserDto } from '../dto/update-user.dto';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { User } from '@users/domain/entities/user.entity';

import { AccountAdministrationPolicy } from '@roles/application/services/account-administration.policy';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly administrationPolicy: AccountAdministrationPolicy,
  ) {}

  async execute(updateUserDto: UpdateUserDto): Promise<User> {
    const { id, firstName, lastName, phone, actorUserId } = updateUserDto;

    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el usuario con ID #${id}`,
      });
    }

    // An administrator edits another account; internal calls (accepting an invitation) have no actor
    if (actorUserId !== undefined) {
      const actor = await this.administrationPolicy.loadActor(actorUserId);
      await this.administrationPolicy.assertCanManageAccount(actor, id);
    }

    if (phone && phone !== user.phone) {
      const phoneExists = await this.userRepository.existsByPhone(phone);
      if (phoneExists) {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: 'Ya existe otro usuario con este número de teléfono',
        });
      }
      user.phone = phone;
    }

    if (firstName) {
      user.firstName = firstName;
    }

    if (lastName !== undefined) {
      user.lastName = lastName;
    }

    return this.userRepository.save(user);
  }
}
