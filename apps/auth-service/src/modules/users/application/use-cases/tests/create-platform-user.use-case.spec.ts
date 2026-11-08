import { status } from '@grpc/grpc-js';
import { CreatePlatformUserUseCase } from '../create-platform-user.use-case';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { User } from '@users/domain/entities/user.entity';
import { ROLES, buildAdministration, rpcError } from './account-administration.fixtures-spec';

describe('CreatePlatformUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: CreatePlatformUserUseCase;

  const request = (roleIds: number[], actorUserId: number) => ({
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@uninorte.edu.co',
    phone: '3001234567',
    roleIds,
    actorUserId,
  });

  beforeEach(() => {
    userRepository = {
      existsByEmail: jest.fn().mockResolvedValue(false),
      existsByPhone: jest.fn().mockResolvedValue(false),
      createWithRoles: jest.fn((user: User) => Promise.resolve(Object.assign(user, { id: 20 }))),
    } as unknown as jest.Mocked<UserRepositoryPort>;
    const passwordHasher = { hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn() } as jest.Mocked<PasswordHasherPort>;
    const { policy, resolvePlatformRoles } = buildAdministration();
    useCase = new CreatePlatformUserUseCase(userRepository, passwordHasher, resolvePlatformRoles, policy);
  });

  it('creates the user with the requested platform roles', async () => {
    const user = await useCase.execute(request([ROLES.Professor.id], 2));

    expect(user.id).toBe(20);
    expect(userRepository.createWithRoles).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@uninorte.edu.co', firstName: 'Ana' }),
      [ROLES.Professor.id],
    );
  });

  it.each([
    ['Admin', ROLES.Admin.id],
    ['FacultyAdmin', ROLES.FacultyAdmin.id],
  ])('does not let a faculty admin create an %s', async (_name, roleId) => {
    await expect(useCase.execute(request([roleId], 2))).rejects.toEqual(
      rpcError(status.PERMISSION_DENIED, 'Only the principal administrator'),
    );
    expect(userRepository.createWithRoles).not.toHaveBeenCalled();
  });

  it('lets the principal admin create a faculty admin', async () => {
    await useCase.execute(request([ROLES.FacultyAdmin.id], 1));

    expect(userRepository.createWithRoles).toHaveBeenCalledWith(expect.anything(), [ROLES.FacultyAdmin.id]);
  });

  it('rejects event roles as platform roles', async () => {
    await expect(useCase.execute(request([ROLES.Juror.id], 1))).rejects.toEqual(
      rpcError(status.INVALID_ARGUMENT, 'event roles'),
    );
  });

  it('rejects roles that do not exist', async () => {
    await expect(useCase.execute(request([999], 1))).rejects.toEqual(rpcError(status.NOT_FOUND));
    expect(userRepository.existsByEmail).not.toHaveBeenCalled();
  });

  it('requires the user performing the operation', async () => {
    await expect(useCase.execute(request([ROLES.Professor.id], 0))).rejects.toEqual(
      rpcError(status.PERMISSION_DENIED, 'required'),
    );
  });

  it('rejects a repeated email', async () => {
    userRepository.existsByEmail.mockResolvedValue(true);

    await expect(useCase.execute(request([ROLES.Professor.id], 1))).rejects.toEqual(rpcError(status.ALREADY_EXISTS));
  });

  it('rejects a repeated phone', async () => {
    userRepository.existsByPhone.mockResolvedValue(true);

    await expect(useCase.execute(request([ROLES.Professor.id], 1))).rejects.toEqual(rpcError(status.ALREADY_EXISTS));
  });
});
