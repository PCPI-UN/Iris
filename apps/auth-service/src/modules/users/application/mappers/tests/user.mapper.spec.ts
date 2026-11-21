import { UserMapper } from '../user.mapper';
import { User, UserStatus } from '@users/domain/entities/user.entity';
import { Role } from '@roles/domain/entities/role.entity';

describe('UserMapper.toGetUsersResponse', () => {
  const meta = {
    totalItems: 2,
    itemsOnPage: 2,
    itemsPerPage: 10,
    totalPages: 1,
    currentPage: 1,
  };

  it('returns each user with its active platform roles', () => {
    const response = UserMapper.toGetUsersResponse({
      data: [
        {
          user: new User(
            1,
            'John',
            'Doe',
            'john@example.com',
            'pass',
            '123',
            true,
            UserStatus.CONFIRMED,
          ),
          roles: [
            new Role(1, 'Admin', 'Administrator', 'PLATFORM'),
            new Role(3, 'Professor', 'Professor', 'PLATFORM'),
          ],
        },
        {
          user: new User(
            2,
            'Jane',
            'Smith',
            'jane@example.com',
            'pass',
            '456',
            true,
            UserStatus.CONFIRMED,
          ),
          roles: [],
        },
      ],
      meta,
    });

    expect(response.users[0].roles).toEqual([
      { id: 1, name: 'Admin', description: 'Administrator', scope: 'PLATFORM' },
      { id: 3, name: 'Professor', description: 'Professor', scope: 'PLATFORM' },
    ]);
    expect(response.users[1].roles).toEqual([]);
    expect(response.users[0]).not.toHaveProperty('password');
    expect(response.meta).toEqual(meta);
  });
});
