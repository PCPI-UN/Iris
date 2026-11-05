import { UpdateOwnProfileUseCase } from '../update-own-profile.use-case';
import { UpdateUserUseCase } from '../update-user.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { status } from '@grpc/grpc-js';

describe('UpdateOwnProfileUseCase', () => {
  let useCase: UpdateOwnProfileUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let updateUserUseCase: jest.Mocked<UpdateUserUseCase>;

  const buildUser = (overrides: Partial<User> = {}) =>
    Object.assign(
      new User(1, 'John', 'Doe', 'john@example.com', 'hashed-password', '3001112233', true, UserStatus.CONFIRMED),
      overrides,
    );

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;
    updateUserUseCase = {
      execute: jest.fn(async (dto) => buildUser({ firstName: dto.firstName ?? 'John' })),
    } as unknown as jest.Mocked<UpdateUserUseCase>;

    useCase = new UpdateOwnProfileUseCase(mockUserRepository, updateUserUseCase);
  });

  it('delegates the update of the caller to UpdateUserUseCase with only the editable fields', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());

    const result = await useCase.execute({
      userId: 1,
      firstName: 'Laura',
      lastName: 'Gómez',
      phone: '3009998877',
    });

    expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
    expect(updateUserUseCase.execute).toHaveBeenCalledWith({
      id: 1,
      firstName: 'Laura',
      lastName: 'Gómez',
      phone: '3009998877',
    });
    expect(result.firstName).toBe('Laura');
  });

  it('does not forward restricted fields, even if they reach the use case', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());

    await useCase.execute({
      userId: 1,
      firstName: 'Laura',
      email: 'hacker@example.com',
      status: 'PENDING',
      active: false,
    } as any);

    expect(updateUserUseCase.execute).toHaveBeenCalledWith({
      id: 1,
      firstName: 'Laura',
      lastName: undefined,
      phone: undefined,
    });
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 99, firstName: 'Laura' })).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.NOT_FOUND }),
    });
    expect(updateUserUseCase.execute).not.toHaveBeenCalled();
  });

  it('throws PERMISSION_DENIED for an inactive user', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser({ active: false }));

    await expect(useCase.execute({ userId: 1, firstName: 'Laura' })).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.PERMISSION_DENIED }),
    });
    expect(updateUserUseCase.execute).not.toHaveBeenCalled();
  });
});
