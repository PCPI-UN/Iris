import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { of } from 'rxjs';
import { AcceptInvitationUseCase } from '../accept-invitation.use-case';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../../domain/repositories/invitation-role.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';
import { InvitationRole } from '../../../domain/entities/invitation-role.entity';
import {
  AuthServiceClient,
} from '../../../../../../../../libs/common/src/generated/auth';
import {
  EventServiceClient,
} from '../../../../../../../../libs/common/src/generated/event';
import { ProjectsServiceClient } from '../../../../../../../../libs/common/src/generated/project';
import { AuthServicePort } from '../../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../../infrastructure/ports/event-service.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project-service.port';

describe('AcceptInvitationUseCase', () => {
  let useCase: AcceptInvitationUseCase;
  let invitationRepository: jest.Mocked<InvitationRepositoryPort>;
  let invitationRoleRepository: jest.Mocked<InvitationRoleRepositoryPort>;
  let authService: jest.Mocked<AuthServiceClient>;
  let eventService: jest.Mocked<EventServiceClient>;
  let projectService: jest.Mocked<ProjectServicePort>;

  beforeEach(async () => {
    const mockInvitationRepository = {
      findByToken: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByTarget: jest.fn(),
      delete: jest.fn(),
    };

    const mockInvitationRoleRepository = {
      findByInvitationId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const mockAuthService = {
      getUser: jest.fn(),
      getUserByEmail: jest.fn(),
      createBasicUser: jest.fn(),
      activateUser: jest.fn(),
      updateUser: jest.fn(),
      assignPlatformRoles: jest.fn(),
      getRolesByIds: jest.fn(),
    };

    const mockEventService = {
      getEvent: jest.fn(),
      createEventMember: jest.fn(),
    };

    const mockProjectService = {
      getProject: jest.fn(),
      addParticipant: jest.fn(),
      listPendingParticipants: jest.fn(),
      addProjectTutor: jest.fn(),
    };

    mockAuthService.getUser.mockResolvedValue({ status: 'ACTIVE' } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcceptInvitationUseCase,
        {
          provide: InvitationRepositoryPort,
          useValue: mockInvitationRepository,
        },
        {
          provide: InvitationRoleRepositoryPort,
          useValue: mockInvitationRoleRepository,
        },
        {
          provide: AuthServicePort,
          useValue: mockAuthService,
        },
        {
          provide: EventServicePort,
          useValue: mockEventService,
        },
        {
          provide: ProjectServicePort,
          useValue: mockProjectService,
        },
      ],
    }).compile();

    useCase = module.get<AcceptInvitationUseCase>(AcceptInvitationUseCase);
    invitationRepository = module.get(InvitationRepositoryPort);
    invitationRoleRepository = module.get(InvitationRoleRepositoryPort);

    authService = mockAuthService as Partial<AuthServiceClient> as jest.Mocked<AuthServiceClient>;
    eventService = mockEventService as Partial<EventServiceClient> as jest.Mocked<EventServiceClient>;
    projectService = mockProjectService as Partial<ProjectServicePort> as jest.Mocked<ProjectServicePort>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy Path - Platform Invitation', () => {
    it('should accept platform invitation with password (new user activation)', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PLATFORM,
        1,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      const roles = [
        new InvitationRole('inv-123', 10),
        new InvitationRole('inv-123', 11),
      ];

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue(roles);
      (authService.getUser as jest.Mock).mockResolvedValue({ status: 'PENDING' });
      authService.activateUser.mockReturnValue(of({}) as any);
      authService.assignPlatformRoles.mockReturnValue(of({}) as any);
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({
        token: 'token-abc',
        password: 'securePassword123',
      });

      // Assert
      expect(result).toEqual({ success: true });
      expect(invitationRepository.findByToken).toHaveBeenCalledWith('token-abc');
      expect(authService.activateUser).toHaveBeenCalledWith({
        userId: 200,
        password: 'securePassword123',
      });
      expect(authService.assignPlatformRoles).toHaveBeenCalledWith({
        userId: 200,
        roleIds: [10, 11],
      });
      expect(invitation.status).toBe(InvitationStatus.ACCEPTED);
      expect(invitationRepository.save).toHaveBeenCalledWith(invitation);
    });

    it('should accept platform invitation without password (existing user)', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PLATFORM,
        1,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      const roles = [new InvitationRole('inv-123', 10)];

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue(roles);
      authService.assignPlatformRoles.mockReturnValue(of({}) as any);
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({ success: true });
      expect(authService.activateUser).not.toHaveBeenCalled();
      expect(authService.assignPlatformRoles).toHaveBeenCalledWith({
        userId: 200,
        roleIds: [10],
      });
    });

    it('should accept platform invitation and update user profile', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PLATFORM,
        1,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue([]);
      (authService.getUser as jest.Mock).mockResolvedValue({ status: 'PENDING' });
      authService.updateUser.mockReturnValue(of({}) as any);
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({
        token: 'token-abc',
        password: 'securePassword123',
        firstName: 'John',
        lastName: 'Doe',
      });

      // Assert
      expect(result).toEqual({ success: true });
      expect(authService.updateUser).toHaveBeenCalledWith({
        id: 200,
        firstName: 'John',
        lastName: 'Doe',
      });
    });
  });

  describe('Happy Path - Event Invitation', () => {
    it('should accept event invitation with roles', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.EVENT,
        5,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      const roles = [
        new InvitationRole('inv-123', 20),
        new InvitationRole('inv-123', 21),
      ];

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue(roles);
      eventService.createEventMember.mockReturnValue(of({}) as any);
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({ success: true });
      expect(eventService.createEventMember).toHaveBeenCalledTimes(2);
      expect(eventService.createEventMember).toHaveBeenCalledWith({
        eventId: 5,
        userId: 200,
        roleId: 20,
      });
      expect(eventService.createEventMember).toHaveBeenCalledWith({
        eventId: 5,
        userId: 200,
        roleId: 21,
      });
      expect(invitation.status).toBe(InvitationStatus.ACCEPTED);
    });

    it('should accept event invitation without roles', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.EVENT,
        5,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue([]);
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({ success: true });
      expect(eventService.createEventMember).not.toHaveBeenCalled();
    });
  });

  describe('Error Cases', () => {
    it('should throw FAILED_PRECONDITION when invitation not found', async () => {
      // Arrange
      invitationRepository.findByToken.mockResolvedValue(null);

      // Act & Assert
      await expect(
        useCase.execute({ token: 'invalid-token' }),
      ).rejects.toThrow(
        new RpcException({
          code: status.FAILED_PRECONDITION,
          message: 'La invitación no se puede aceptar',
        }),
      );

      expect(invitationRepository.save).not.toHaveBeenCalled();
    });

    it('should throw FAILED_PRECONDITION when invitation is expired', async () => {
      // Arrange
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PLATFORM,
        1,
        InvitationStatus.PENDING,
        pastDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);

      // Act & Assert
      await expect(useCase.execute({ token: 'token-abc' })).rejects.toThrow(
        new RpcException({
          code: status.FAILED_PRECONDITION,
          message: 'La invitación no se puede aceptar',
        }),
      );
    });

    it('should throw FAILED_PRECONDITION when invitation is already accepted', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PLATFORM,
        1,
        InvitationStatus.ACCEPTED,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);

      // Act & Assert
      await expect(useCase.execute({ token: 'token-abc' })).rejects.toThrow(
        new RpcException({
          code: status.FAILED_PRECONDITION,
          message: 'La invitación no se puede aceptar',
        }),
      );
    });

    it('should throw FAILED_PRECONDITION when invitation is rejected', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PLATFORM,
        1,
        InvitationStatus.REJECTED,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);

      // Act & Assert
      await expect(useCase.execute({ token: 'token-abc' })).rejects.toThrow(
        new RpcException({
          code: status.FAILED_PRECONDITION,
          message: 'La invitación no se puede aceptar',
        }),
      );
    });

    it('should accept project invitation using pending participant studentCode', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PROJECT,
        10,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue([]);
      projectService.getProject.mockResolvedValue({
        id: 10,
        eventId: 99,
        name: 'Project A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        courseId: 1,
        state: 1,
      } as any);
      projectService.listPendingParticipants.mockResolvedValue([
        {
          pendingId: 1,
          projectId: 10,
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'user@example.com',
          studentCode: '2023001',
          semester: '7',
          career: 'Engineering',
          status: 'PENDING',
          invitedAt: new Date().toISOString(),
          joinedAt: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as any);
      projectService.addParticipant.mockReturnValue(of({ participant: {} } as any) as any);
      eventService.createEventMember.mockReturnValue(of({}) as any);
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({ success: true });
      expect(projectService.listPendingParticipants).toHaveBeenCalledWith(10);
      expect(projectService.addParticipant).toHaveBeenCalledWith({
        userId: 200,
        projectId: 10,
        studentCode: '2023001',
      });
      expect(eventService.createEventMember).not.toHaveBeenCalled();
      expect(invitation.status).toBe(InvitationStatus.ACCEPTED);
      expect(invitationRepository.save).toHaveBeenCalledWith(invitation);
    });

    it('should throw INVALID_ARGUMENT when project pending participant is missing', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const invitation = new Invitation(
        'inv-123',
        'token-abc',
        'user@example.com',
        InvitationTargetType.PROJECT,
        10,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue([]);
      projectService.getProject.mockResolvedValue({
        id: 10,
        eventId: 99,
        name: 'Project A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        courseId: 1,
        state: 1,
      } as any);
      projectService.listPendingParticipants.mockResolvedValue([] as any);

      // Act & Assert
      await expect(useCase.execute({ token: 'token-abc' })).rejects.toThrow(
        new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'No se pudo obtener el código de estudiante de los participantes pendientes de esta invitación',
        }),
      );

      expect(projectService.addParticipant).not.toHaveBeenCalled();
      expect(invitationRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Project tutor invitation', () => {
    const tutorInvitation = () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      return new Invitation(
        'inv-tutor',
        'token-tutor',
        'tutor@example.com',
        InvitationTargetType.PROJECT_TUTOR,
        10,
        InvitationStatus.PENDING,
        futureDate,
        100,
        200,
        new Date(),
        new Date(),
      );
    };

    it('adds the Tutor role, links the tutor to the project and creates no event member', async () => {
      const invitation = tutorInvitation();
      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue([]);
      invitationRepository.save.mockResolvedValue(invitation);

      const result = await useCase.execute({ token: 'token-tutor' });

      expect(result).toEqual({ success: true });
      expect(authService.assignPlatformRoles).toHaveBeenCalledWith({
        userId: 200,
        roleIds: [10],
      });
      expect(projectService.addProjectTutor).toHaveBeenCalledWith({
        projectId: 10,
        userId: 200,
        email: 'tutor@example.com',
      });
      expect(eventService.createEventMember).not.toHaveBeenCalled();
      expect(projectService.addParticipant).not.toHaveBeenCalled();
      expect(projectService.listPendingParticipants).not.toHaveBeenCalled();
      expect(invitationRepository.save).toHaveBeenCalled();
    });

    it('neither grants the Tutor role nor accepts the invitation when the project rejects the link', async () => {
      const invitation = tutorInvitation();
      invitationRepository.findByToken.mockResolvedValue(invitation);
      invitationRoleRepository.findByInvitationId.mockResolvedValue([]);
      projectService.addProjectTutor.mockRejectedValue(
        new Error('El proyecto no tiene un tutor pendiente con este correo'),
      );

      await expect(useCase.execute({ token: 'token-tutor' })).rejects.toThrow('no tiene un tutor pendiente');
      expect(authService.assignPlatformRoles).not.toHaveBeenCalled();
      expect(invitationRepository.save).not.toHaveBeenCalled();
    });
  });
});
