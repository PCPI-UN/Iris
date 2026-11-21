import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AuthorizeInvitationUseCase } from '../authorize-invitation.use-case';
import { AuthServicePort } from '../../../infrastructure/ports/auth-service.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project-service.port';
import { InvitationTargetType } from '../../../domain/entities/invitation.entity';

const ADMIN = 1;
const MANAGER = 2; // EventManager: manage:events, create:invitations
const STUDENT = 3; // participant of project 10
const OTHER = 7; // signed in, unrelated
const PROJECT = 10;

const ACCESS: Record<number, { roleNames: string[]; permissions: string[] }> = {
  [ADMIN]: { roleNames: ['Admin'], permissions: [] },
  [MANAGER]: { roleNames: ['EventManager'], permissions: ['manage:events', 'create:invitations'] },
};
const EMAILS: Record<number, string> = { [ADMIN]: 'admin@x.test', [MANAGER]: 'em@x.test', [STUDENT]: 's@x.test', [OTHER]: 'o@x.test' };
const ROLE_NAMES: Record<number, string> = { 1: 'Admin', 4: 'Juror', 5: 'Participant', 7: 'Dean', 10: 'Tutor' };

const denied = (message: string) => new RpcException({ code: status.PERMISSION_DENIED, message });

function build() {
  const auth = {
    getUserPlatformAccess: jest.fn(async (id: number) => ACCESS[id] ?? { roleNames: ['User'], permissions: [] }),
    getUser: jest.fn(async (id: number) => ({ id, email: EMAILS[id] })),
    getRolesByIds: jest.fn(async (ids: number[]) => ({
      roles: ids.filter((id) => ROLE_NAMES[id]).map((id) => ({ id, name: ROLE_NAMES[id] })),
    })),
    // auth-service rule: Admin role only with manage:admins (the principal Admin)
    checkPlatformRoleGrant: jest.fn(async ({ actorUserId, roleIds }: { actorUserId: number; roleIds: number[] }) => {
      if (roleIds.includes(1) && actorUserId !== ADMIN) throw denied('admin only');
    }),
  };
  const project = {
    checkCanEditProject: jest.fn(async (userId: number, projectId: number) => {
      const allowed = (userId === STUDENT && projectId === PROJECT) || userId === MANAGER || userId === ADMIN;
      if (!allowed) throw denied('not a participant');
    }),
  };
  const useCase = new AuthorizeInvitationUseCase(
    auth as unknown as AuthServicePort,
    project as unknown as ProjectServicePort,
  );
  return { useCase, auth, project };
}

const invite = (
  useCase: AuthorizeInvitationUseCase,
  inviterUserId: number,
  targetType: InvitationTargetType,
  roleIds: number[],
  email = 'new@x.test',
) => useCase.execute({ inviterUserId, email, targetType, targetId: targetType === InvitationTargetType.PLATFORM ? 1 : PROJECT, roleIds });

describe('AuthorizeInvitationUseCase', () => {
  describe('PLATFORM', () => {
    it('does not let a user without create:invitations invite, not even as Admin', async () => {
      const { useCase, auth } = build();
      await expect(invite(useCase, OTHER, InvitationTargetType.PLATFORM, [1], EMAILS[OTHER])).rejects.toThrow(RpcException);
      await expect(invite(useCase, OTHER, InvitationTargetType.PLATFORM, [7])).rejects.toThrow(RpcException);
      expect(auth.checkPlatformRoleGrant).not.toHaveBeenCalled();
    });

    it('does not let anyone invite themselves', async () => {
      const { useCase } = build();
      await expect(invite(useCase, ADMIN, InvitationTargetType.PLATFORM, [7], 'ADMIN@x.test')).rejects.toThrow(RpcException);
    });

    it('asks auth-service whether the inviter may grant the roles', async () => {
      const { useCase, auth } = build();
      await expect(invite(useCase, MANAGER, InvitationTargetType.PLATFORM, [1])).rejects.toThrow(RpcException);
      await expect(invite(useCase, MANAGER, InvitationTargetType.PLATFORM, [7])).resolves.toBeUndefined();
      await expect(invite(useCase, ADMIN, InvitationTargetType.PLATFORM, [1])).resolves.toBeUndefined();
      expect(auth.checkPlatformRoleGrant).toHaveBeenCalledWith({ actorUserId: MANAGER, roleIds: [7] });
    });
  });

  describe('EVENT', () => {
    it('requires manage:events', async () => {
      const { useCase } = build();
      await expect(invite(useCase, STUDENT, InvitationTargetType.EVENT, [4])).rejects.toThrow(RpcException);
      await expect(invite(useCase, MANAGER, InvitationTargetType.EVENT, [4])).resolves.toBeUndefined();
      await expect(invite(useCase, ADMIN, InvitationTargetType.EVENT, [4])).resolves.toBeUndefined();
    });
  });

  describe('PROJECT', () => {
    it('lets a participant invite a teammate as Participant (student dashboard)', async () => {
      const { useCase } = build();
      await expect(invite(useCase, STUDENT, InvitationTargetType.PROJECT, [5])).resolves.toBeUndefined();
    });

    it('does not let an unrelated user invite to the project', async () => {
      const { useCase } = build();
      await expect(invite(useCase, OTHER, InvitationTargetType.PROJECT, [5])).rejects.toThrow(RpcException);
    });

    it('only gives the Participant role', async () => {
      const { useCase, project } = build();
      await expect(invite(useCase, STUDENT, InvitationTargetType.PROJECT, [4])).rejects.toMatchObject({
        error: expect.objectContaining({ code: status.INVALID_ARGUMENT }),
      });
      await expect(invite(useCase, STUDENT, InvitationTargetType.PROJECT, [5, 1])).rejects.toThrow(RpcException);
      await expect(invite(useCase, STUDENT, InvitationTargetType.PROJECT, [999])).rejects.toThrow(RpcException);
      expect(project.checkCanEditProject).not.toHaveBeenCalled();
    });
  });

  describe('PROJECT_TUTOR', () => {
    it('only gives the Tutor role and needs a participant or manage:events', async () => {
      const { useCase } = build();
      await expect(invite(useCase, STUDENT, InvitationTargetType.PROJECT_TUTOR, [10])).resolves.toBeUndefined();
      await expect(invite(useCase, STUDENT, InvitationTargetType.PROJECT_TUTOR, [1])).rejects.toThrow(RpcException);
      await expect(invite(useCase, OTHER, InvitationTargetType.PROJECT_TUTOR, [10])).rejects.toThrow(RpcException);
    });
  });
});
