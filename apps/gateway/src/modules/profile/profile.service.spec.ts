import { status } from '@grpc/grpc-js';
import { ProfileService } from './profile.service';
import { AppUser } from '../auth/types/app-user.type';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

describe('ProfileService', () => {
  const user: AppUser = {
    id: 10,
    firstName: 'Laura',
    lastName: 'Gómez',
    email: 'laura@test.local',
    phone: '3001112233',
    active: true,
    status: 'CONFIRMED',
    platformRoles: [{ id: 2, name: 'User', scope: 'PLATFORM' }],
    platformPermissions: [],
  };

  const participation = (id: number, studentCode: string) => ({
    project: {
      id,
      name: `Project ${id}`,
      eventId: 1,
      courseId: 3,
      state: 'APPROVED',
    },
    studentCode,
  });

  const grpcError = (code: status) =>
    Object.assign(new Error(`grpc error ${code}`), { code });

  const build = (
    listUserParticipations: jest.Mock,
    updateOwnProfile = jest.fn(),
  ) =>
    new ProfileService(
      { updateOwnProfile } as unknown as AuthService,
      { listUserParticipations } as unknown as ProjectsService,
    );

  it('composes the profile with the academic data returned by project-service', async () => {
    const listUserParticipations = jest.fn().mockResolvedValue({
      participations: [
        participation(5, '2021001001'),
        participation(2, '2019001001'),
      ],
      academic: {
        studentCode: '2021001001',
        career: 'Ingeniería de Sistemas',
        semester: '8',
      },
      total: 12,
    });

    const profile = await build(listUserParticipations).getProfile(user);

    expect(listUserParticipations).toHaveBeenCalledWith(
      10,
      'laura@test.local',
      10,
    );
    expect(profile.academic).toEqual({
      studentCode: '2021001001',
      career: 'Ingeniería de Sistemas',
      semester: '8',
      derived: true,
    });
    expect(profile.projects.map((p) => p.id)).toEqual([5, 2]);
    expect(profile.totalProjects).toBe(12);
    expect(profile.roles).toEqual(['User']);
  });

  it('returns empty academic data when project-service has none', async () => {
    const listUserParticipations = jest
      .fn()
      .mockResolvedValue({ participations: [], total: 0 });

    const profile = await build(listUserParticipations).getProfile(user);

    expect(profile.academic).toEqual({
      studentCode: null,
      career: null,
      semester: null,
      derived: true,
    });
    expect(profile.projects).toEqual([]);
  });

  it('still returns the profile when project-service is unavailable', async () => {
    const listUserParticipations = jest
      .fn()
      .mockRejectedValue(grpcError(status.UNAVAILABLE));

    const profile = await build(listUserParticipations).getProfile(user);

    expect(profile.email).toBe('laura@test.local');
    expect(profile.projects).toEqual([]);
  });

  it.each([status.INTERNAL, status.UNIMPLEMENTED, status.INVALID_ARGUMENT])(
    'propagates any other project-service error (code %p)',
    async (code) => {
      const listUserParticipations = jest
        .fn()
        .mockRejectedValue(grpcError(code));

      await expect(
        build(listUserParticipations).getProfile(user),
      ).rejects.toMatchObject({ code });
    },
  );

  it('updates only the caller and only the editable fields', async () => {
    const updateOwnProfile = jest.fn().mockResolvedValue({
      id: 10,
      firstName: 'Laura María',
      lastName: 'Gómez',
      phone: '3009998877',
    });
    const listUserParticipations = jest
      .fn()
      .mockResolvedValue({ participations: [], total: 0 });

    const profile = await build(
      listUserParticipations,
      updateOwnProfile,
    ).updateProfile(user, { firstName: 'Laura María', phone: '3009998877' });

    expect(updateOwnProfile).toHaveBeenCalledWith({
      userId: 10,
      firstName: 'Laura María',
      lastName: undefined,
      phone: '3009998877',
    });
    expect(profile.firstName).toBe('Laura María');
    expect(profile.email).toBe('laura@test.local');
  });
});
