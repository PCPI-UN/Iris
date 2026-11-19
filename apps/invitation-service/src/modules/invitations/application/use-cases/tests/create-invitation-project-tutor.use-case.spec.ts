import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CreateInvitationUseCase } from '../create-invitation.use-case';
import { InvitationTargetType } from '../../../domain/entities/invitation.entity';

describe('CreateInvitationUseCase - PROJECT_TUTOR', () => {
  let invitationRepository: any;
  let invitationRoleRepository: any;
  let authService: any;
  let eventService: any;
  let projectService: any;
  let notificationService: any;
  let useCase: CreateInvitationUseCase;

  const dto = {
    email: 'Tutor@Example.com',
    eventType: 'Exposition',
    targetType: InvitationTargetType.PROJECT_TUTOR,
    targetId: 10,
    invitedByUserId: 100,
    roleIds: [10],
  };

  beforeEach(() => {
    invitationRepository = {
      findAcceptedByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      findPendingByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      save: jest.fn((inv) => Promise.resolve(inv)),
    };
    invitationRoleRepository = {
      save: jest.fn((role) => Promise.resolve(role)),
      findByInvitationId: jest.fn().mockResolvedValue([]),
    };
    authService = {
      getUserByEmail: jest.fn().mockResolvedValue({ id: 200, firstName: 'Tutor', status: 'ACTIVE' }),
      createBasicUser: jest.fn(),
      generateAccountSetupToken: jest.fn(),
      getRolesByIds: jest.fn().mockResolvedValue({ roles: [{ id: 10, name: 'Tutor' }] }),
    };
    eventService = { getEvent: jest.fn() };
    projectService = { getProject: jest.fn().mockResolvedValue({ id: 10, name: 'Project A', eventId: 5 }) };
    notificationService = { sendProjectTutorInvitationEmail: jest.fn().mockResolvedValue({ success: true }) };
    const config = { get: jest.fn((_: string, fallback?: unknown) => fallback ?? 'http://front') };

    useCase = new CreateInvitationUseCase(
      invitationRepository,
      invitationRoleRepository,
      authService,
      eventService,
      projectService,
      notificationService,
      config as any,
    );
  });

  it('validates that the project exists, stores the roles and sends the tutor email', async () => {
    const { invitation, invitationRoles } = await useCase.execute(dto);

    expect(projectService.getProject).toHaveBeenCalledWith(10);
    expect(eventService.getEvent).not.toHaveBeenCalled();
    expect(invitation.targetType).toBe(InvitationTargetType.PROJECT_TUTOR);
    expect(invitation.email).toBe('tutor@example.com');
    expect(invitationRoles.map((r) => r.roleId)).toEqual([10]);
    expect(notificationService.sendProjectTutorInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'tutor@example.com', projectName: 'Project A' }),
    );
  });

  it('fails with NOT_FOUND and creates nothing when the project does not exist', async () => {
    projectService.getProject.mockResolvedValue(null);

    await expect(useCase.execute(dto)).rejects.toMatchObject(
      new RpcException({ code: status.NOT_FOUND, message: 'No se encontró el proyecto con ID 10' }),
    );
    expect(invitationRepository.save).not.toHaveBeenCalled();
    expect(notificationService.sendProjectTutorInvitationEmail).not.toHaveBeenCalled();
  });

  it('returns the existing pending invitation instead of creating another one', async () => {
    const existing = { id: 'inv-1', targetType: InvitationTargetType.PROJECT_TUTOR };
    invitationRepository.findPendingByEmailAndTargetType.mockResolvedValue(existing);

    const result = await useCase.execute(dto);

    expect(result.invitation).toBe(existing);
    expect(invitationRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an email that already accepted a tutor invitation for the project', async () => {
    invitationRepository.findAcceptedByEmailAndTargetType.mockResolvedValue({ id: 'inv-0' });

    await expect(useCase.execute(dto)).rejects.toMatchObject({
      error: { code: status.ALREADY_EXISTS },
    });
  });
});
