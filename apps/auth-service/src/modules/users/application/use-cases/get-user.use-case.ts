import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { GetUserDto } from '../dto/get-user.dto';
import { User } from '@users/domain/entities/user.entity';

@Injectable()
export class GetUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute({ id }: GetUserDto): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el usuario con ID #${id}`,
      });
    }
    return user;
  }
}
