import { RpcException } from '@nestjs/microservices';
import { CreateEventMemberUseCase } from '../create-event-member.use-case';
import { EventMemberRepository } from '@events/domain/repositories/event-member.repository';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { AuthClientPort } from '@events/infrastructure/ports/auth-client.port';

const JUROR_ROLE = { id: 4, name: 'Juror', scope: 'EVENT' };

const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  active: true,
  isPubliclyJoinable: true,
  endDate: futureDate(),
  ...overrides,
});

describe('CreateEventMemberUseCase', () => {
  let eventRepository: { findById: jest.Mock };
  let eventMemberRepository: {
    findActiveByUserAndEvent: jest.Mock;
    create: jest.Mock;
  };
  let authClient: { getUser: jest.Mock; getRolesByIds: jest.Mock };
  let useCase: CreateEventMemberUseCase;

  const input = { eventId: 10, userId: 7, roleId: JUROR_ROLE.id };

  beforeEach(() => {
    eventRepository = { findById: jest.fn() };
    eventMemberRepository = {
      findActiveByUserAndEvent: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((member: unknown) => Promise.resolve(member)),
    };
    authClient = {
      getUser: jest.fn().mockResolvedValue({ id: 7 }),
      getRolesByIds: jest.fn().mockResolvedValue({ roles: [JUROR_ROLE] }),
    };
    useCase = new CreateEventMemberUseCase(
      eventMemberRepository as unknown as EventMemberRepository,
      eventRepository as unknown as EventRepository,
      authClient as unknown as AuthClientPort,
    );
  });

  it('adds the member to an event that is not publicly joinable', async () => {
    eventRepository.findById.mockResolvedValue(
      buildEvent({ isPubliclyJoinable: false }),
    );

    await expect(useCase.execute(input)).resolves.toMatchObject({
      eventId: 10,
      userId: 7,
      roleId: 4,
      active: true,
    });
    expect(eventMemberRepository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an inactive event', async () => {
    eventRepository.findById.mockResolvedValue(buildEvent({ active: false }));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(RpcException);
    expect(eventMemberRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an event that has already ended', async () => {
    eventRepository.findById.mockResolvedValue(
      buildEvent({ endDate: pastDate() }),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(RpcException);
    expect(eventMemberRepository.create).not.toHaveBeenCalled();
  });

  it('returns the existing membership without creating another one', async () => {
    const existing = { eventId: 10, userId: 7, roleId: 4, active: true };
    eventRepository.findById.mockResolvedValue(buildEvent());
    eventMemberRepository.findActiveByUserAndEvent.mockResolvedValue(existing);

    await expect(useCase.execute(input)).resolves.toBe(existing);
    expect(eventMemberRepository.create).not.toHaveBeenCalled();
  });
});
