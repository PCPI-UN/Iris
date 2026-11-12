import { status } from '@grpc/grpc-js';
import { AuthServiceAdapter } from '../auth-service.adapter';
import { AuthGrpcClient } from '../auth.grpc-client';

describe('AuthServiceAdapter.findUserByEmail', () => {
  let getUserByEmail: jest.Mock;
  let adapter: AuthServiceAdapter;

  beforeEach(() => {
    getUserByEmail = jest.fn();
    adapter = new AuthServiceAdapter({
      getUserByEmail,
    } as unknown as AuthGrpcClient);
  });

  it('maps the user returned by auth-service', async () => {
    getUserByEmail.mockResolvedValue({
      id: 7,
      firstName: 'Ana Pérez',
      lastName: '',
      email: 'ana.perez@uninorte.edu.co',
      phone: undefined,
      active: true,
      status: 'CONFIRMED',
    });

    await expect(
      adapter.findUserByEmail('ana.perez@uninorte.edu.co'),
    ).resolves.toEqual({
      id: 7,
      firstName: 'Ana Pérez',
      lastName: '',
      email: 'ana.perez@uninorte.edu.co',
      status: 'CONFIRMED',
    });
    expect(getUserByEmail).toHaveBeenCalledWith('ana.perez@uninorte.edu.co');
  });

  it('returns null when auth-service answers NOT_FOUND', async () => {
    getUserByEmail.mockRejectedValue({ code: status.NOT_FOUND });

    await expect(adapter.findUserByEmail('nadie@example.com')).resolves.toBe(
      null,
    );
  });

  it('rethrows any other error', async () => {
    const unavailable = { code: status.UNAVAILABLE, details: 'down' };
    getUserByEmail.mockRejectedValue(unavailable);

    await expect(adapter.findUserByEmail('ana@example.com')).rejects.toBe(
      unavailable,
    );
  });
});

describe('AuthServiceAdapter.findUsersByIds', () => {
  let getUser: jest.Mock;
  let adapter: AuthServiceAdapter;

  beforeEach(() => {
    getUser = jest.fn();
    adapter = new AuthServiceAdapter({ getUser } as unknown as AuthGrpcClient);
  });

  it('asks once per distinct id and leaves out the ids with no user', async () => {
    const found = (id: number) => ({
      id,
      firstName: `U${id}`,
      email: `u${id}@x.co`,
      status: 'CONFIRMED',
    });
    // calls go out in the order of the distinct ids: 1, 2, 9
    getUser
      .mockResolvedValueOnce(found(1))
      .mockResolvedValueOnce(found(2))
      .mockRejectedValueOnce({ code: status.NOT_FOUND });

    const users = await adapter.findUsersByIds([1, 2, 1, 9]);

    expect(users.map((u) => u.id)).toEqual([1, 2]);
    expect(getUser).toHaveBeenCalledTimes(3);
  });

  it('rethrows any other error', async () => {
    const unavailable = { code: status.UNAVAILABLE };
    getUser.mockRejectedValue(unavailable);

    await expect(adapter.findUsersByIds([1])).rejects.toBe(unavailable);
  });
});
