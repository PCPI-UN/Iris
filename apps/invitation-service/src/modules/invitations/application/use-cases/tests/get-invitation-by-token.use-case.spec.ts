import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { of } from 'rxjs';
import { GetInvitationByTokenUseCase } from '../get-invitation-by-token.use-case';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';
import {
  AUTH_SERVICE_NAME,
  AuthServiceClient,
} from '@app/common/generated/auth';

describe('GetInvitationByTokenUseCase', () => {
  let useCase: GetInvitationByTokenUseCase;
  let invitationRepository: jest.Mocked<InvitationRepositoryPort>;
  let authService: jest.Mocked<AuthServiceClient>;

  beforeEach(async () => {
    const mockInvitationRepository = {
      findByToken: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByTarget: jest.fn(),
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

    const mockClientGrpc = {
      getService: jest.fn().mockReturnValue(mockAuthService),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetInvitationByTokenUseCase,
        {
          provide: InvitationRepositoryPort,
          useValue: mockInvitationRepository,
        },
        {
          provide: AUTH_SERVICE_NAME,
          useValue: mockClientGrpc,
        },
      ],
    }).compile();

    useCase = module.get<GetInvitationByTokenUseCase>(
      GetInvitationByTokenUseCase,
    );
    invitationRepository = module.get(InvitationRepositoryPort);

    // Trigger onModuleInit
    await useCase.onModuleInit();

    // Get the auth service that was set during onModuleInit
    authService = mockAuthService as Partial<AuthServiceClient> as jest.Mocked<AuthServiceClient>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should return invitation details with user information', async () => {
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

      const mockUser = {
        id: 200,
        email: 'user@example.com',
        status: 'PENDING',
        firstName: 'John',
        lastName: 'Doe',
      };

      invitationRepository.findByToken.mockResolvedValue(invitation);
      authService.getUser.mockReturnValue(of(mockUser) as any);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({
        email: 'user@example.com',
        userStatus: 'PENDING',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(invitationRepository.findByToken).toHaveBeenCalledWith('token-abc');
      expect(authService.getUser).toHaveBeenCalledWith({ id: 200 });
    });

    it('should return invitation details with partial user information', async () => {
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

      const mockUser = {
        id: 200,
        email: 'user@example.com',
        status: 'CONFIRMED',
        firstName: undefined,
        lastName: undefined,
      };

      invitationRepository.findByToken.mockResolvedValue(invitation);
      authService.getUser.mockReturnValue(of(mockUser) as any);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({
        email: 'user@example.com',
        userStatus: 'CONFIRMED',
        firstName: undefined,
        lastName: undefined,
      });
    });
  });

  describe('Error Cases', () => {
    it('should throw NOT_FOUND when invitation does not exist', async () => {
      // Arrange
      invitationRepository.findByToken.mockResolvedValue(null);

      // Act & Assert
      await expect(
        useCase.execute({ token: 'invalid-token' }),
      ).rejects.toThrow(
        new RpcException({
          code: status.NOT_FOUND,
          message: 'No se encontró la invitación o no es válida',
        }),
      );

      expect(authService.getUser).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when invitation is expired', async () => {
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
          code: status.NOT_FOUND,
          message: 'No se encontró la invitación o no es válida',
        }),
      );

      expect(authService.getUser).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when invitation is already accepted', async () => {
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
          code: status.NOT_FOUND,
          message: 'No se encontró la invitación o no es válida',
        }),
      );

      expect(authService.getUser).not.toHaveBeenCalled();
    });

    it('should throw FAILED_PRECONDITION when invitedUserId is missing', async () => {
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
        null as any, // Missing invitedUserId
        new Date(),
        new Date(),
      );

      invitationRepository.findByToken.mockResolvedValue(invitation);

      // Act & Assert
      await expect(useCase.execute({ token: 'token-abc' })).rejects.toThrow(
        new RpcException({
          code: status.FAILED_PRECONDITION,
          message: 'La invitación no tiene un usuario válido.',
        }),
      );

      expect(authService.getUser).not.toHaveBeenCalled();
    });
  });
});
