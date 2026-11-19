import { ConfigService } from '@nestjs/config';
import { status } from '@grpc/grpc-js';
import { CreateInvitationUseCase } from '../create-invitation.use-case';
import { CreateInvitationDto } from '../../dto/create-invitation.dto';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../../domain/repositories/invitation-role.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';
import { AuthServicePort } from '../../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../../infrastructure/ports/event-service.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project-service.port';
import { NotificationServicePort } from '../../../infrastructure/ports/notification-service.port';

const FRONTEND_URL = 'https://iris.test';

describe('CreateInvitationUseCase', () => {
  let useCase: CreateInvitationUseCase;
  let invitationRepository: {
    findAcceptedByEmailAndTargetType: jest.Mock;
    findPendingByEmailAndTargetType: jest.Mock;
    save: jest.Mock;
  };
  let invitationRoleRepository: {
    findByInvitationId: jest.Mock;
    save: jest.Mock;
  };
  let authService: {
    getUserByEmail: jest.Mock;
    createBasicUser: jest.Mock;
    generateAccountSetupToken: jest.Mock;
    getRolesByIds: jest.Mock;
  };
  let eventService: { getEvent: jest.Mock };
  let projectService: { getProject: jest.Mock };
  let notificationService: {
    sendPlatformInvitationEmail: jest.Mock;
    sendJurorInvitationEmail: jest.Mock;
    sendProjectSubmittedInvitationEmail: jest.Mock;
    sendProjectTutorInvitationEmail: jest.Mock;
  };

  const existingUser = {
    id: 7,
    email: 'ana@uninorte.edu.co',
    firstName: 'Ana',
    lastName: 'Pérez',
    status: 'CONFIRMED',
  };
  const newUser = {
    id: 9,
    email: 'luis@uninorte.edu.co',
    firstName: 'luis',
    lastName: undefined,
    status: 'PENDING',
  };

  const dto = (
    overrides: Partial<CreateInvitationDto> = {},
  ): CreateInvitationDto => ({
    email: 'ana@uninorte.edu.co',
    eventType: 'Exposition',
    targetType: InvitationTargetType.EVENT,
    targetId: 3,
    invitedByUserId: 1,
    roleIds: [4],
    ...overrides,
  });

  beforeEach(() => {
    invitationRepository = {
      findAcceptedByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      findPendingByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (invitation: Invitation) => invitation),
    };
    invitationRoleRepository = {
      findByInvitationId: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (role) => role),
    };
    authService = {
      getUserByEmail: jest.fn().mockResolvedValue(existingUser),
      createBasicUser: jest.fn().mockResolvedValue(newUser),
      generateAccountSetupToken: jest
        .fn()
        .mockResolvedValue({
          token: 'setup-token',
          expiresAt: new Date('2026-12-01T00:00:00Z'),
        }),
      getRolesByIds: jest.fn().mockResolvedValue({
        roles: [
          { id: 6, name: 'FacultyAdmin' },
          { id: 7, name: 'Dean' },
        ],
      }),
    };
    eventService = {
      getEvent: jest
        .fn()
        .mockResolvedValue({
          id: 3,
          name: 'Feria',
          description: 'Feria de proyectos',
        }),
    };
    projectService = {
      getProject: jest
        .fn()
        .mockResolvedValue({ id: 12, name: 'Robot', eventId: 3 }),
    };
    notificationService = {
      sendPlatformInvitationEmail: jest.fn(),
      sendJurorInvitationEmail: jest.fn(),
      sendProjectSubmittedInvitationEmail: jest.fn(),
      sendProjectTutorInvitationEmail: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'FRONTEND_URL' ? FRONTEND_URL : fallback,
      ),
    } as unknown as ConfigService;

    useCase = new CreateInvitationUseCase(
      invitationRepository as unknown as InvitationRepositoryPort,
      invitationRoleRepository as unknown as InvitationRoleRepositoryPort,
      authService as unknown as AuthServicePort,
      eventService as unknown as EventServicePort,
      projectService as unknown as ProjectServicePort,
      notificationService as unknown as NotificationServicePort,
      configService,
    );
  });

  describe('existing user', () => {
    it('invites to an event with a random token, the roles and a link to the dashboard', async () => {
      const { invitation, invitationRoles } = await useCase.execute(dto());

      expect(authService.createBasicUser).not.toHaveBeenCalled();
      expect(authService.generateAccountSetupToken).not.toHaveBeenCalled();
      expect(invitation).toMatchObject({
        email: 'ana@uninorte.edu.co',
        targetType: InvitationTargetType.EVENT,
        targetId: 3,
        status: InvitationStatus.PENDING,
      });
      expect(invitation.token).not.toBe('setup-token');
      expect(invitationRoles).toEqual([
        expect.objectContaining({ invitationId: invitation.id, roleId: 4 }),
      ]);
      // Event invitations go to jurors
      expect(notificationService.sendJurorInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ana@uninorte.edu.co',
          firstName: 'Ana',
          invitationLink: `${FRONTEND_URL}/app/invitations`,
          eventName: 'Feria',
          eventDescription: 'Feria de proyectos',
          roles: 'Jurado',
        }),
      );
    });
  });

  describe('new user', () => {
    beforeEach(() => {
      authService.getUserByEmail.mockRejectedValue({ code: status.NOT_FOUND });
    });

    it('creates the account and uses its account setup token, with a link to set the password', async () => {
      const { invitation } = await useCase.execute(
        dto({ email: 'luis@uninorte.edu.co' }),
      );

      expect(authService.createBasicUser).toHaveBeenCalledWith({
        email: 'luis@uninorte.edu.co',
        firstName: 'luis',
        lastName: undefined,
      });
      expect(authService.generateAccountSetupToken).toHaveBeenCalledWith(9);
      expect(invitation).toMatchObject({
        token: 'setup-token',
        expiresAt: new Date('2026-12-01T00:00:00Z'),
      });
      expect(notificationService.sendJurorInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationLink: `${FRONTEND_URL}/auth/chg-password?token=setup-token`,
        }),
      );
    });

    it('creates the account with the names that were sent', async () => {
      await useCase.execute(
        dto({
          email: 'luis@uninorte.edu.co',
          firstName: 'Luis',
          lastName: 'Gómez',
        }),
      );

      expect(authService.createBasicUser).toHaveBeenCalledWith({
        email: 'luis@uninorte.edu.co',
        firstName: 'Luis',
        lastName: 'Gómez',
      });
    });

    it('does not create an account when auth-service fails for another reason', async () => {
      authService.getUserByEmail.mockRejectedValue({
        code: status.UNAVAILABLE,
      });

      await expect(useCase.execute(dto())).rejects.toEqual({
        code: status.UNAVAILABLE,
      });
      expect(authService.createBasicUser).not.toHaveBeenCalled();
      expect(invitationRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('target types', () => {
    it('platform: sends the names of the roles', async () => {
      await useCase.execute(
        dto({
          targetType: InvitationTargetType.PLATFORM,
          targetId: 0,
          roleIds: [6, 7],
        }),
      );

      expect(eventService.getEvent).not.toHaveBeenCalled();
      expect(authService.getRolesByIds).toHaveBeenCalledWith([6, 7]);
      expect(
        notificationService.sendPlatformInvitationEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ roles: 'FacultyAdmin, Dean' }),
      );
    });

    it('platform without roles: no roles lookup and no invitation roles', async () => {
      const { invitationRoles } = await useCase.execute(
        dto({
          targetType: InvitationTargetType.PLATFORM,
          targetId: 0,
          roleIds: [],
        }),
      );

      expect(authService.getRolesByIds).not.toHaveBeenCalled();
      expect(invitationRoleRepository.save).not.toHaveBeenCalled();
      expect(invitationRoles).toEqual([]);
      expect(
        notificationService.sendPlatformInvitationEmail,
      ).toHaveBeenCalledWith(expect.objectContaining({ roles: '' }));
    });

    it('project: looks up the project and its event for the email', async () => {
      await useCase.execute(
        dto({ targetType: InvitationTargetType.PROJECT, targetId: 12 }),
      );

      expect(projectService.getProject).toHaveBeenCalledWith(12);
      expect(eventService.getEvent).toHaveBeenCalledWith(3);
      expect(
        notificationService.sendProjectSubmittedInvitationEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'Robot',
          eventName: 'Feria',
          eventType: 'Exposition',
        }),
      );
    });

    it('project tutor: looks up the project only', async () => {
      await useCase.execute(
        dto({ targetType: InvitationTargetType.PROJECT_TUTOR, targetId: 12 }),
      );

      expect(eventService.getEvent).not.toHaveBeenCalled();
      expect(
        notificationService.sendProjectTutorInvitationEmail,
      ).toHaveBeenCalledWith(expect.objectContaining({ projectName: 'Robot' }));
    });
  });

  describe('repeated invitations', () => {
    it('rejects an email that already accepted an invitation to the same target', async () => {
      invitationRepository.findAcceptedByEmailAndTargetType.mockResolvedValue({
        id: 'accepted',
      });

      await expect(useCase.execute(dto())).rejects.toMatchObject({
        error: expect.objectContaining({
          code: status.ALREADY_EXISTS,
          message: 'El usuario ya aceptó una invitación para este evento',
        }),
      });
      expect(invitationRepository.save).not.toHaveBeenCalled();
    });

    it('returns the pending invitation with its roles instead of creating another one', async () => {
      const pending = { id: 'pending' };
      invitationRepository.findPendingByEmailAndTargetType.mockResolvedValue(
        pending,
      );
      invitationRoleRepository.findByInvitationId.mockResolvedValue([
        { invitationId: 'pending', roleId: 4 },
      ]);

      await expect(useCase.execute(dto())).resolves.toEqual({
        invitation: pending,
        invitationRoles: [{ invitationId: 'pending', roleId: 4 }],
      });
      expect(invitationRepository.save).not.toHaveBeenCalled();
      expect(
        notificationService.sendJurorInvitationEmail,
      ).not.toHaveBeenCalled();
    });
  });
});
