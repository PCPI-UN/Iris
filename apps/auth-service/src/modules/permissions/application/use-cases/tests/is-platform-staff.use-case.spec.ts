import { IsPlatformStaffUseCase } from '../is-platform-staff.use-case';
import { PermissionRepositoryPort } from '@permissions/domain/repositories/permission.repository.port';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { Permission } from '@permissions/domain/entities/permission.entity';

describe('IsPlatformStaffUseCase', () => {
  const role = (id: number, name: string) => ({ id, name, scope: 'PLATFORM', description: name });
  const permission = (value: string) => {
    const [action, resource] = value.split(':');
    return new Permission(1, action, resource, null);
  };

  const buildUseCase = (roles: ReturnType<typeof role>[], permissions: string[]) => {
    const permissionRepository = {
      findUserPlatformPermissions: jest
        .fn()
        .mockResolvedValue({ roles, permissions: permissions.map(permission) }),
    } as unknown as PermissionRepositoryPort;
    const userRepository = {} as UserRepositoryPort;
    return new IsPlatformStaffUseCase(permissionRepository, userRepository);
  };

  it.each([
    ['FacultyAdmin', ['manage:events', 'read:events']],
    ['Dean', ['read:events', 'read:grades']],
    ['EventManager', ['manage:events', 'read:events']],
  ])('counts %s as platform staff because it reads every event', async (name, permissions) => {
    const result = await buildUseCase([role(6, name)], permissions).execute({ userId: 10 });

    expect(result).toEqual(expect.objectContaining({ isPlatformStaff: true, role: expect.objectContaining({ name }) }));
  });

  it('counts Admin as platform staff even without explicit permissions', async () => {
    const result = await buildUseCase([role(1, 'Admin')], []).execute({ userId: 10 });

    expect(result.isPlatformStaff).toBe(true);
  });

  it.each(['User', 'Professor', 'Tutor', 'DepartmentDirector'])(
    'does not count %s as platform staff',
    async (name) => {
      const result = await buildUseCase(
        [role(3, name)],
        ['view:public_events', 'accept:invitations', 'manage:own_profile', 'view:own_data'],
      ).execute({ userId: 10 });

      expect(result).toEqual({ isPlatformStaff: false });
    },
  );

  it('returns the Admin role when the user also holds another one', async () => {
    const result = await buildUseCase([role(9, 'Professor'), role(1, 'Admin')], ['read:events']).execute({
      userId: 10,
    });

    expect(result.role?.name).toBe('Admin');
  });
});
