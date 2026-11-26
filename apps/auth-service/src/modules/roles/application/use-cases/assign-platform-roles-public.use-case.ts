import { Injectable } from '@nestjs/common';
import { AssignPlatformRolesDto } from '../dto/assign-platform-roles.dto';
import { ValidateRolesExistUseCase } from './validate-roles-exist.use-case';
import { AssignPlatformRoleUseCase } from './assign-platform-role.use-case';
import { CheckPlatformRoleGrantUseCase } from './check-platform-role-grant.use-case';

@Injectable()
export class AssignPlatformRolesPublicUseCase {
  constructor(
    private readonly validateRolesExistUseCase: ValidateRolesExistUseCase,
    private readonly assignPlatformRoleUseCase: AssignPlatformRoleUseCase,
    private readonly checkPlatformRoleGrantUseCase: CheckPlatformRoleGrantUseCase,
  ) {}

  async execute(dto: AssignPlatformRolesDto): Promise<{ success: boolean }> {
    const { userId, roleIds, actorUserId } = dto;

    // Validate that all roles exist
    await this.validateRolesExistUseCase.execute(roleIds);

    // A platform invitation sends its inviter: the grant must respect the administrator rules
    if (actorUserId) {
      await this.checkPlatformRoleGrantUseCase.execute({
        actorUserId,
        roleIds,
        targetUserId: userId,
      });
    }

    // Assign the roles to the user
    await this.assignPlatformRoleUseCase.execute(userId, roleIds);

    return { success: true };
  }
}
