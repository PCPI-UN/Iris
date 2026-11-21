import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { User } from '@users/domain/entities/user.entity';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { GetUserByEmailDto } from '../dto/get-user-by-email.dto';

@Injectable()
export class GetUserByEmailUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(getUserByEmailDto: GetUserByEmailDto): Promise<User> {
    const { email } = getUserByEmailDto;
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el usuario con el correo ${email}`,
      });
    }

    return user;
  }
}
