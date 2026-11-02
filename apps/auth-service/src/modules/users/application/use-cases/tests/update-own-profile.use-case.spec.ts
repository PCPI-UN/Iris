import { UpdateOwnProfileUseCase } from '../update-own-profile.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('UpdateOwnProfileUseCase', () => {
  let useCase: UpdateOwnProfileUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;

  const buildUser = (overrides: Partial<User> = {}) =>
    Object.assign(
      new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '3001112233',
        true,
        UserStatus.CONFIRMED,
      ),
      overrides,
    );

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(async (user: User) => user),
      existsByPhone: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    useCase = new UpdateOwnProfileUseCase(mockUserRepository);
  });

  it('updates the editable fields of the caller', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());
    mockUserRepository.existsByPhone.mockResolvedValue(false);

    const result = await useCase.execute({
      userId: 1,
      firstName: '  Laura ',
      lastName: 'Gómez',
      phone: '3009998877',
    });

    expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
    expect(result.firstName).toBe('Laura');
    expect(result.lastName).toBe('Gómez');
    expect(result.phone).toBe('3009998877');
  });

  it('never changes restricted fields, even if they reach the use case', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());

    const result = await useCase.execute({
      userId: 1,
      firstName: 'Laura',
      email: 'hacker@example.com',
      status: 'PENDING',
      active: false,
      password: 'plain',
    } as any);

    expect(result.email).toBe('john@example.com');
    expect(result.status).toBe(UserStatus.CONFIRMED);
    expect(result.active).toBe(true);
    expect(result.password).toBe('hashed-password');
  });

  it('only edits the user given by userId', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser({ id: 7 } as Partial<User>));

    await useCase.execute({ userId: 7, firstName: 'Laura' });

    expect(mockUserRepository.findById).toHaveBeenCalledWith(7);
    expect(mockUserRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('keeps the last name when it is not sent and clears it when sent empty', async () => {
    mockUserRepository.findById.mockResolvedValueOnce(buildUser());
    const untouched = await useCase.execute({ userId: 1, firstName: 'Laura' });
    expect(untouched.lastName).toBe('Doe');

    mockUserRepository.findById.mockResolvedValueOnce(buildUser());
    const cleared = await useCase.execute({ userId: 1, lastName: '' });
    expect(cleared.lastName).toBe('');
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 99, firstName: 'Laura' })).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.NOT_FOUND }),
    });
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('throws PERMISSION_DENIED for an inactive user', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser({ active: false }));

    await expect(useCase.execute({ userId: 1, firstName: 'Laura' })).rejects.toBeInstanceOf(
      RpcException,
    );
    await expect(useCase.execute({ userId: 1, firstName: 'Laura' })).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.PERMISSION_DENIED }),
    });
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('throws ALREADY_EXISTS when the phone belongs to another user', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());
    mockUserRepository.existsByPhone.mockResolvedValue(true);

    await expect(useCase.execute({ userId: 1, phone: '3005556677' })).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.ALREADY_EXISTS }),
    });
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('does not check uniqueness when the phone does not change', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());

    await useCase.execute({ userId: 1, phone: '3001112233' });

    expect(mockUserRepository.existsByPhone).not.toHaveBeenCalled();
  });
});
