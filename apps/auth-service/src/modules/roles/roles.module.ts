import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { RoleRepositoryPort } from '@roles/domain/repositories/role.repository.port';
import { PrismaRoleRepository } from '@roles/infrastructure/prisma/prisma-role.repository';
import { PlatformStaffRepositoryPort } from '@roles/domain/repositories/platform-staff.repository.port';
import { PrismaPlatformStaffRepository } from '@roles/infrastructure/prisma/prisma-platform-staff.repository';
import { ValidateRolesExistUseCase } from '@roles/application/use-cases/validate-roles-exist.use-case';
import { AssignPlatformRoleUseCase } from '@roles/application/use-cases/assign-platform-role.use-case';
import { AssignPlatformRolesPublicUseCase } from '@roles/application/use-cases/assign-platform-roles-public.use-case';
import { FindUsersByRolesUseCase } from '@roles/application/use-cases/find-users-by-roles.use-case';
import { GetRolesByIdsUseCase } from '@roles/application/use-cases/get-roles-by-ids.use-case';
import { GetRolesUseCase } from '@roles/application/use-cases/get-roles.use-case';
import { RemovePlatformRoleUseCase } from '@roles/application/use-cases/remove-platform-role.use-case';
import { RolesController } from '@roles/interface/grpc/roles.controller';

import { ResolvePlatformRolesUseCase } from './application/use-cases/resolve-platform-roles.use-case';
import { AccountAdministrationPolicy } from './application/services/account-administration.policy';

@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [
    ValidateRolesExistUseCase,
    AssignPlatformRoleUseCase,
    AssignPlatformRolesPublicUseCase,
    GetRolesByIdsUseCase,
    FindUsersByRolesUseCase,
    GetRolesUseCase,
    RemovePlatformRoleUseCase,
    ResolvePlatformRolesUseCase,
    AccountAdministrationPolicy,
    {
      provide: RoleRepositoryPort,
      useClass: PrismaRoleRepository,
    },
    {
      provide: PlatformStaffRepositoryPort,
      useClass: PrismaPlatformStaffRepository,
    },
  ],
  exports: [
    ValidateRolesExistUseCase,
    AssignPlatformRoleUseCase,
    GetRolesUseCase,
    ResolvePlatformRolesUseCase,
    AccountAdministrationPolicy,
    PlatformStaffRepositoryPort,
  ],
})
export class RolesModule {}
