import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { User } from '@users/domain/entities/user.entity';
import { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';
import { UpdateUserUseCase } from './update-user.use-case';

/**
 * Self-service profile edition. The caller is always the owner of the account
 * (the gateway takes userId from the session). Only active users can edit their
 * profile; the update itself is the same as the admin one.
 */
@Injectable()
export class UpdateOwnProfileUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly updateUserUseCase: UpdateUserUseCase,
  ) {}

  async execute(dto: UpdateOwnProfileDto): Promise<User> {
    const { userId, firstName, lastName, phone } = dto;

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el usuario con ID #${userId}`,
      });
    }

    if (!user.active) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Los usuarios inactivos no pueden editar su perfil',
      });
    }

    return this.updateUserUseCase.execute({
      id: userId,
      firstName,
      lastName,
      phone,
    });
  }
}
