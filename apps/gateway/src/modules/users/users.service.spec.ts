import { of } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { UsersService } from './users.service';

describe('UsersService.findAll', () => {
  const getUsers = jest.fn();
  let service: UsersService;

  beforeEach(() => {
    getUsers.mockReset();
    const client = {
      getService: () => ({ getUsers }),
    } as unknown as ClientGrpc;
    service = new UsersService(client);
    service.onModuleInit();
  });

  it('returns roles as an empty list when gRPC omits them', async () => {
    const admin = {
      id: 1,
      name: 'Admin',
      description: 'Administrator',
      scope: 'PLATFORM',
    };
    getUsers.mockReturnValue(
      of({
        users: [
          {
            id: 1,
            firstName: 'John',
            email: 'john@example.com',
            roles: [admin],
          },
          { id: 2, firstName: 'Jane', email: 'jane@example.com' },
        ],
        meta: { totalItems: 2 },
      }),
    );

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.users[0].roles).toEqual([admin]);
    expect(result.users[1].roles).toEqual([]);
    expect(result.meta).toEqual({ totalItems: 2 });
  });

  it('returns an empty user list when gRPC omits it', async () => {
    getUsers.mockReturnValue(of({ meta: { totalItems: 0 } }));

    const result = await service.findAll({});

    expect(result.users).toEqual([]);
  });
});
