import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { User } from '@users/domain/entities/user.entity';
import { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';

/**
 * Self-service profile edition. The caller is always the owner of the account
 * (the gateway takes userId from the session), and only the fields declared in
 * UpdateOwnProfileDto can change.
 */
@Injectable()
export class UpdateOwnProfileUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(dto: UpdateOwnProfileDto): Promise<User> {
    const { userId, firstName, lastName, phone } = dto;

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `User with ID #${userId} not found`,
      });
    }

    if (!user.active) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Inactive users cannot edit their profile',
      });
    }

    if (phone && phone !== user.phone) {
      const phoneExists = await this.userRepository.existsByPhone(phone);
      if (phoneExists) {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: 'Another user with this phone number already exists',
        });
      }
      user.phone = phone;
    }

    if (firstName) {
      user.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      user.lastName = lastName.trim();
    }

    return this.userRepository.save(user);
  }
}
