import { Module } from '@nestjs/common';
import { UsersController } from './interface/grpc/users.controller';
import { CreatePlatformUserUseCase } from './application/use-cases/create-platform-user.use-case';
import { UserRepositoryPort } from './domain/repositories/user.repository.port';
import { PrismaUserRepository } from './infrastructure/prisma/prisma.repository';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { BcryptAdapter } from '@common/hash/bcrypt.adapter';
import { RolesModule } from '@roles/roles.module';
import { UserTokenRepositoryPort } from './domain/repositories/user-token.repository.port';
import { PrismaUserTokenRepository } from './infrastructure/prisma/prisma-user-token.repository';
import { CreateBasicUserUseCase } from './application/use-cases/create-basic-user.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { UpdateOwnProfileUseCase } from './application/use-cases/update-own-profile.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { PrismaModule } from '@common/prisma/prisma.module';
import { GetUserByEmailUseCase } from './application/use-cases/get-user-by-email.use-case';
import { ActivateUserUseCase } from './application/use-cases/activate-user.use-case';
import { ActivateUserWithMicrosoftUseCase } from './application/use-cases/activate-user-with-microsoft.use-case';

@Module({
  imports: [RolesModule, PrismaModule],
  controllers: [UsersController],
  providers: [
    CreatePlatformUserUseCase,
    CreateBasicUserUseCase,
    ActivateUserUseCase,
    ActivateUserWithMicrosoftUseCase,
    GetUserUseCase,
    GetUserByEmailUseCase,
    GetUsersUseCase,
    UpdateUserUseCase,
    UpdateOwnProfileUseCase,
    DeactivateUserUseCase,
    {
      provide: UserRepositoryPort,
      useClass: PrismaUserRepository,
    },
    {
      provide: UserTokenRepositoryPort,
      useClass: PrismaUserTokenRepository,
    },
    {
      provide: PasswordHasherPort,
      useClass: BcryptAdapter,
    },
  ],
  exports: [UserRepositoryPort, UserTokenRepositoryPort, PasswordHasherPort],
})
export class UsersModule { }
