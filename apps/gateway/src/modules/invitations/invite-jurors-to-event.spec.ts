import { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { InvitationsService } from './invitations.service';

describe('InvitationsService.inviteJurorsToEvent', () => {
  const JUROR_ROLE = { id: 4, name: 'Juror', scope: 'EVENT' };
  let getRoles: jest.Mock;
  let findPendingByEmail: jest.Mock;
  let createInvitation: jest.Mock;
  let service: InvitationsService;

  const client = (methods: Record<string, jest.Mock>) =>
    ({ getService: () => methods }) as unknown as ClientGrpc;

  beforeEach(() => {
    getRoles = jest.fn().mockReturnValue(
      of({
        roles: [{ id: 1, name: 'Admin', scope: 'PLATFORM' }, JUROR_ROLE],
      }),
    );
    findPendingByEmail = jest.fn().mockReturnValue(of({}));
    createInvitation = jest.fn().mockReturnValue(of({ id: 'inv' }));
    service = new InvitationsService(
      client({ findPendingByEmail, createInvitation }),
      client({ getRoles }),
      client({}),
      client({}),
      {} as ConfigService,
    );
    service.onModuleInit();
  });

  const jurors = [
    { email: 'ana@x.co', firstName: 'Ana', lastName: 'Pérez' },
    { email: 'luis@x.co', firstName: 'Luis' },
  ];

  it('looks up the Juror role once for every juror', async () => {
    await service.inviteJurorsToEvent(5, 'Competition', jurors, 99);

    expect(getRoles).toHaveBeenCalledTimes(1);
    expect(createInvitation).toHaveBeenCalledTimes(2);
    expect(createInvitation).toHaveBeenCalledWith({
      email: 'ana@x.co',
      eventType: 'Competition',
      firstName: 'Ana',
      lastName: 'Pérez',
      targetType: 'EVENT',
      targetId: 5,
      invitedByUserId: 99,
      roleIds: [4],
    });
  });

  it('does not invite again a juror with a pending invitation to the event', async () => {
    findPendingByEmail.mockImplementation(({ email }: { email: string }) =>
      of(email === 'luis@x.co' ? { invitation: { id: 'old' } } : {}),
    );

    const result = await service.inviteJurorsToEvent(
      5,
      'Competition',
      jurors,
      99,
    );

    expect(findPendingByEmail).toHaveBeenCalledWith({
      email: 'luis@x.co',
      targetType: 'EVENT',
      targetId: 5,
    });
    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      sent: ['ana@x.co'],
      reused: ['luis@x.co'],
      failed: [],
    });
  });

  it('reports a failed invitation and keeps inviting the others', async () => {
    createInvitation.mockImplementation(({ email }: { email: string }) =>
      email === 'ana@x.co'
        ? throwError(() => ({
            code: 6,
            details: 'El usuario ya aceptó una invitación para este evento',
          }))
        : of({ id: 'inv' }),
    );

    const result = await service.inviteJurorsToEvent(
      5,
      'Competition',
      jurors,
      99,
    );

    expect(result).toEqual({
      sent: ['luis@x.co'],
      reused: [],
      failed: [
        {
          email: 'ana@x.co',
          message: 'El usuario ya aceptó una invitación para este evento',
        },
      ],
    });
  });

  it('calls nobody when there are no jurors', async () => {
    const result = await service.inviteJurorsToEvent(5, 'Competition', [], 99);

    expect(result).toEqual({ sent: [], reused: [], failed: [] });
    expect(getRoles).not.toHaveBeenCalled();
  });
});
