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
