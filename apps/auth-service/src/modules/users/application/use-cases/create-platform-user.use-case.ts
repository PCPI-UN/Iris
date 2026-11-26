import { User } from '@users/domain/entities/user.entity';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { CreatePlatformUserDto } from '@users/application/dto/create-platform-user.dto';
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { ResolvePlatformRolesUseCase } from '@roles/application/use-cases/resolve-platform-roles.use-case';
import { AccountAdministrationPolicy } from '@roles/application/services/account-administration.policy';

@Injectable()
export class CreatePlatformUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly resolvePlatformRoles: ResolvePlatformRolesUseCase,
    private readonly administrationPolicy: AccountAdministrationPolicy,
  ) {}

  async execute(createPlatformUserDto: CreatePlatformUserDto): Promise<User> {
    const { email, phone, roleIds, actorUserId, ...rest } = createPlatformUserDto;

    const roles = await this.resolvePlatformRoles.execute(roleIds);

    // Only the principal administrator creates administrators (IRIS-V3-ADM-02)
    const actor = await this.administrationPolicy.loadActor(actorUserId);
    this.administrationPolicy.assertCanGrant(actor, roles);

    const emailExists = await this.userRepository.existsByEmail(email);
    if (emailExists) {
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: 'Ya existe otro usuario con este correo',
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
      rest.firstName,
      rest.lastName,
      email,
      hashedPassword,
      phone,
    );

    return this.userRepository.createWithRoles(newUser, roles.map((role) => role.id));
  }
}