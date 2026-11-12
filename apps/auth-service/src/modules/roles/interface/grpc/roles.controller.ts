import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AssignPlatformRolesPublicUseCase } from '../../application/use-cases/assign-platform-roles-public.use-case';
import { GetRolesByIdsUseCase } from '../../application/use-cases/get-roles-by-ids.use-case';
import { GetRolesUseCase } from "../../application/use-cases/get-roles.use-case";
import { RemovePlatformRoleUseCase } from '../../application/use-cases/remove-platform-role.use-case';
import { FindUsersByRolesUseCase } from '../../application/use-cases/find-users-by-roles.use-case';
import { AssignPlatformRolesDto } from '../../application/dto/assign-platform-roles.dto';
import {
  AUTH_SERVICE_NAME,
  FindUsersByRolesRequest,
  FindUsersByRolesResponse,
} from '@app/common/generated/auth';

@Controller()
export class RolesController {
  constructor(
    private readonly assignPlatformRolesPublicUseCase: AssignPlatformRolesPublicUseCase,
    private readonly getRolesByIdsUseCase: GetRolesByIdsUseCase,
    private readonly getRolesUseCase: GetRolesUseCase,
    private readonly removePlatformRoleUseCase: RemovePlatformRoleUseCase,
    private readonly findUsersByRolesUseCase: FindUsersByRolesUseCase,
  ) {}

  @GrpcMethod(AUTH_SERVICE_NAME, 'AssignPlatformRoles')
  async assignPlatformRoles(
    request: AssignPlatformRolesDto,
  ): Promise<{ success: boolean }> {
    return await this.assignPlatformRolesPublicUseCase.execute(request);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'FindUsersByRoles')
  async findUsersByRoles(
    request: FindUsersByRolesRequest,
  ): Promise<FindUsersByRolesResponse> {
    const users = await this.findUsersByRolesUseCase.execute(request);
    return {
      users: users.map((user) => ({
        ...user,
        lastName: user.lastName ?? undefined,
      })),
    };
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetRolesByIds')
  async getRolesByIds(request: { roleIds: number[] }) {
    const roles = await this.getRolesByIdsUseCase.execute(request.roleIds);
    return { roles };
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetRoles')
  async getRoles() {
    const roles = await this.getRolesUseCase.execute();
    return { roles };
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'RemovePlatformRole')
  async removePlatformRole(data: { userId: number; roleId: number }) {
    return this.removePlatformRoleUseCase.execute(data.userId, data.roleId);
  }
}
