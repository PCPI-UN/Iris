import {
  GetUsersResponse,
  User as UserProto,
} from '@app/common/generated/auth';
import { User } from '@users/domain/entities/user.entity';
import { UserWithPlatformRoles } from '@users/domain/repositories/user.repository.port';

export class UserMapper {
  static toCreateUserResponse(user: User): UserProto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      active: user.active,
      status: user.status,
      roles: [],
    };
  }

  static toGetUserResponse(user: User): UserProto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      active: user.active,
      status: user.status,
      roles: [],
    };
  }

  static toGetUsersResponse(paginatedResult: {
    data: UserWithPlatformRoles[];
    meta: GetUsersResponse['meta'];
  }): GetUsersResponse {
    return {
      users: paginatedResult.data.map(({ user, roles }) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        active: user.active,
        status: user.status,
        roles: roles.map(({ id, name, description, scope }) => ({
          id,
          name,
          description,
          scope,
        })),
      })),
      meta: paginatedResult.meta,
    };
  }
}
