import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { RejectInvitationUseCase } from '../reject-invitation.use-case';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';

describe('RejectInvitationUseCase', () => {
  let useCase: RejectInvitationUseCase;
  let invitationRepository: jest.Mocked<InvitationRepositoryPort>;

  beforeEach(async () => {
    const mockInvitationRepository = {
      findByToken: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByTarget: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RejectInvitationUseCase,
        {
          provide: InvitationRepositoryPort,
          useValue: mockInvitationRepository,
        },
      ],
    }).compile();

    useCase = module.get<RejectInvitationUseCase>(RejectInvitationUseCase);
    invitationRepository = module.get(InvitationRepositoryPort);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should successfully reject a pending invitation', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

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
      invitationRepository.save.mockResolvedValue(invitation);

      // Act
      const result = await useCase.execute({ token: 'token-abc' });

      // Assert
      expect(result).toEqual({ success: true });
      expect(invitationRepository.findByToken).toHaveBeenCalledWith('token-abc');
      expect(invitation.status).toBe(InvitationStatus.REJECTED);
      expect(invitationRepository.save).toHaveBeenCalledWith(invitation);
    });
  });

  describe('Error Cases', () => {
    it('should throw NOT_FOUND when invitation does not exist', async () => {
      // Arrange
      invitationRepository.findByToken.mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute({ token: 'invalid-token' })).rejects.toThrow(
        new RpcException({
          code: status.NOT_FOUND,
          message: 'No se encontró la invitación',
        }),
      );

      expect(invitationRepository.save).not.toHaveBeenCalled();
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
          message: 'La invitación no se puede rechazar (expiró o ya se procesó)',
        }),
      );

      expect(invitationRepository.save).not.toHaveBeenCalled();
    });

    it('should throw FAILED_PRECONDITION when invitation is already rejected', async () => {
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
          message: 'La invitación no se puede rechazar (expiró o ya se procesó)',
        }),
      );

      expect(invitationRepository.save).not.toHaveBeenCalled();
    });

    it('should throw FAILED_PRECONDITION when invitation is expired', async () => {
      // Arrange
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // 1 day ago

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
          message: 'La invitación no se puede rechazar (expiró o ya se procesó)',
        }),
      );

      expect(invitationRepository.save).not.toHaveBeenCalled();
    });
  });
});
