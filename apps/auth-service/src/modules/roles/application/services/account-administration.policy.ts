import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  ActiveRole,
  PlatformStaffRepositoryPort,
} from '@roles/domain/repositories/platform-staff.repository.port';

/** Principal administrator: bypasses every permission check in the gateway. */
export const ADMIN_ROLE_NAME = 'Admin';

/** Roles that administer the platform; only `manage:admins` can grant, remove or touch them. */
export const ADMINISTRATOR_ROLE_NAMES = [ADMIN_ROLE_NAME, 'FacultyAdmin'];

export const MANAGE_ADMINS_PERMISSION = 'manage:admins';

export interface Actor {
  userId: number;
  canManageAdmins: boolean;
}

/**
 * Rules for administering accounts (IRIS-V3-ADM-02). A faculty administrator does every
 * administrative operation except managing administrators:
 *
 * - only an actor with `manage:admins` (the principal Admin) can grant or remove an
 *   administrator role, or create, edit or deactivate an administrator account;
 * - nobody changes their own roles or deactivates their own account, so nobody raises
 *   their own privileges or locks the platform out.
 *
 * They are enforced here, in auth-service, so they hold even when the endpoints are
 * called directly.
 */
@Injectable()
export class AccountAdministrationPolicy {
  constructor(
    private readonly platformStaffRepository: PlatformStaffRepositoryPort,
  ) {}

  async loadActor(actorUserId: number | undefined): Promise<Actor> {
    if (!actorUserId) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Se requiere el usuario que realiza la operación',
      });
    }

    const roles = await this.platformStaffRepository.findActiveRoles(actorUserId);
    return {
      userId: actorUserId,
      canManageAdmins: roles.some(
        (role) =>
          role.name === ADMIN_ROLE_NAME ||
          role.permissions.includes(MANAGE_ADMINS_PERMISSION),
      ),
    };
  }

  /** Rejects granting administrator roles without `manage:admins`. */
  assertCanGrant(actor: Actor, roles: Array<{ name: string }>): void {
    const administratorRoles = roles.filter((role) =>
      ADMINISTRATOR_ROLE_NAMES.includes(role.name),
    );
    if (administratorRoles.length > 0 && !actor.canManageAdmins) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: `Solo el administrador principal puede asignar los roles ${administratorRoles
          .map((role) => role.name)
          .join(', ')}`,
      });
    }
  }

  /** Rejects touching an administrator account without `manage:admins`. Returns the target roles. */
  async assertCanManageAccount(actor: Actor, targetUserId: number): Promise<ActiveRole[]> {
    const targetRoles = await this.platformStaffRepository.findActiveRoles(targetUserId);
    const isAdministrator = targetRoles.some((role) =>
      ADMINISTRATOR_ROLE_NAMES.includes(role.name),
    );
    if (isAdministrator && !actor.canManageAdmins) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Solo el administrador principal puede modificar una cuenta de administrador',
      });
    }
    return targetRoles;
  }

  /** Rejects leaving the platform without an active principal administrator. */
  async assertKeepsAnAdmin(targetUserId: number, targetRoles: ActiveRole[]): Promise<void> {
    const adminRole = targetRoles.find((role) => role.name === ADMIN_ROLE_NAME);
    if (!adminRole) return;

    const otherAdmins = await this.platformStaffRepository.countActiveAdminsByRoleId(
      adminRole.id,
      targetUserId,
    );
    if (otherAdmins === 0) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'La plataforma no puede quedar sin un administrador activo',
      });
    }
  }

  assertNotSelf(actor: Actor, targetUserId: number, operation: string): void {
    if (actor.userId === targetUserId) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: `Un usuario no puede ${operation} su propia cuenta`,
      });
    }
  }
}
