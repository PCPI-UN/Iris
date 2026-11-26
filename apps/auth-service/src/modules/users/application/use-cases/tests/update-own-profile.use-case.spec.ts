import { UpdateOwnProfileUseCase } from '../update-own-profile.use-case';
import { UpdateUserUseCase } from '../update-user.use-case';
import { UpdateOwnProfileDto } from '../../dto/update-own-profile.dto';
import { UpdateUserDto } from '../../dto/update-user.dto';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import {
  User,
  UserStatus,
} from '../../../../users/domain/entities/user.entity';
import { status } from '@grpc/grpc-js';

describe('UpdateOwnProfileUseCase', () => {
  let useCase: UpdateOwnProfileUseCase;
  let findById: jest.Mock<Promise<User | null>, [number]>;
  let updateUser: jest.Mock<Promise<User>, [UpdateUserDto]>;

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
    findById = jest.fn<Promise<User | null>, [number]>();
    updateUser = jest.fn((dto: UpdateUserDto) =>
      Promise.resolve(buildUser({ firstName: dto.firstName ?? 'John' })),
    );

    useCase = new UpdateOwnProfileUseCase(
      { findById } as unknown as UserRepositoryPort,
      { execute: updateUser } as unknown as UpdateUserUseCase,
    );
  });

  it('delegates the update of the caller to UpdateUserUseCase with only the editable fields', async () => {
    findById.mockResolvedValue(buildUser());

    const result = await useCase.execute({
      userId: 1,
      firstName: 'Laura',
      lastName: 'Gómez',
      phone: '3009998877',
    });

    expect(findById).toHaveBeenCalledWith(1);
    expect(updateUser).toHaveBeenCalledWith({
      id: 1,
      firstName: 'Laura',
      lastName: 'Gómez',
      phone: '3009998877',
    });
    expect(result.firstName).toBe('Laura');
  });

  it('does not forward restricted fields, even if they reach the use case', async () => {
    findById.mockResolvedValue(buildUser());

    await useCase.execute({
      userId: 1,
      firstName: 'Laura',
      email: 'hacker@example.com',
      status: 'PENDING',
      active: false,
    } as unknown as UpdateOwnProfileDto);

    expect(updateUser).toHaveBeenCalledWith({
      id: 1,
      firstName: 'Laura',
      lastName: undefined,
      phone: undefined,
    });
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ userId: 99, firstName: 'Laura' }),
    ).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.NOT_FOUND }),
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('throws PERMISSION_DENIED for an inactive user', async () => {
    findById.mockResolvedValue(buildUser({ active: false }));

    await expect(
      useCase.execute({ userId: 1, firstName: 'Laura' }),
    ).rejects.toMatchObject({
      error: expect.objectContaining({ code: status.PERMISSION_DENIED }),
    });
    expect(updateUser).not.toHaveBeenCalled();
  });
});
