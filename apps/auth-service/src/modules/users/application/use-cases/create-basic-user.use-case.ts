import { User } from '@users/domain/entities/user.entity';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CreateBasicUserDto } from '../dto/create-basic-user.dto';
import { GetRolesUseCase } from '@roles/application/use-cases/get-roles.use-case';
import { Role } from '@roles/domain/entities/role.entity';

@Injectable()
export class CreateBasicUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly getRolesUseCase: GetRolesUseCase,
  ) {}

  async execute(createBasicUserDto: CreateBasicUserDto): Promise<User> {
    const { email, phone } = createBasicUserDto;

    const emailExists = await this.userRepository.existsByEmail(email);
    if (emailExists) {
      const existingUser = await this.userRepository.findByEmail(email);
      if (existingUser && !existingUser.active) {
        return existingUser;
      }

      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: 'Ya existe un usuario activo con este correo',
      });
    }

    if (phone) {
      const phoneExists = await this.userRepository.existsByPhone(phone);
      if (phoneExists) {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: 'Ya existe otro usuario con este número de teléfono',
        });
      }
    }

    const randomPassword = randomBytes(16).toString('hex');
    const hashedPassword = await this.passwordHasher.hash(randomPassword);

    const newUser = new User(
      0,
      createBasicUserDto.firstName,
      createBasicUserDto.lastName,
      email,
      hashedPassword,
      phone,
    );

    const roles = await this.getRolesUseCase.execute();
    const userRole = roles.find((role: Role) => role.name === 'User');
    const rolesToAssign = userRole ? [userRole.id] : [];

    return this.userRepository.createWithRoles(newUser, rolesToAssign);
  }
}
