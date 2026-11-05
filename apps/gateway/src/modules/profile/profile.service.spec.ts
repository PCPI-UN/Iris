import { status } from '@grpc/grpc-js';
import { ProfileService } from './profile.service';
import { AppUser } from '../auth/types/app-user.type';

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
    project: { id, name: `Project ${id}`, eventId: 1, courseId: 3, state: 'APPROVED' },
    studentCode,
  });

  const build = (projectsService: any, authService: any = {}) =>
    new ProfileService(authService, projectsService);

  it('composes the profile with the academic data returned by project-service', async () => {
    const projectsService = {
      listUserParticipations: jest.fn(async () => ({
        participations: [participation(5, '2021001001'), participation(2, '2019001001')],
        academic: { studentCode: '2021001001', career: 'Ingeniería de Sistemas', semester: '8' },
        total: 12,
      })),
    };

    const profile = await build(projectsService).getProfile(user);

    expect(projectsService.listUserParticipations).toHaveBeenCalledWith(10, 'laura@test.local', 10);
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
    const projectsService = { listUserParticipations: async () => ({ participations: [], total: 0 }) };

    const profile = await build(projectsService).getProfile(user);

    expect(profile.academic).toEqual({ studentCode: null, career: null, semester: null, derived: true });
    expect(profile.projects).toEqual([]);
  });

  it('still returns the profile when project-service is unavailable', async () => {
    const projectsService = {
      listUserParticipations: async () => {
        throw { code: status.UNAVAILABLE, message: 'No connection established' };
      },
    };

    const profile = await build(projectsService).getProfile(user);

    expect(profile.email).toBe('laura@test.local');
    expect(profile.projects).toEqual([]);
  });

  it.each([status.INTERNAL, status.UNIMPLEMENTED, status.INVALID_ARGUMENT])(
    'propagates any other project-service error (code %p)',
    async (code) => {
      const projectsService = {
        listUserParticipations: async () => {
          throw { code, message: 'boom' };
        },
      };

      await expect(build(projectsService).getProfile(user)).rejects.toMatchObject({ code });
    },
  );

  it('updates only the caller and only the editable fields', async () => {
    const authService = {
      updateOwnProfile: jest.fn(async () => ({
        id: 10,
        firstName: 'Laura María',
        lastName: 'Gómez',
        phone: '3009998877',
      })),
    };

    const profile = await build(
      { listUserParticipations: async () => ({ participations: [], total: 0 }) },
      authService,
    ).updateProfile(user, { firstName: 'Laura María', phone: '3009998877' });

    expect(authService.updateOwnProfile).toHaveBeenCalledWith({
      userId: 10,
      firstName: 'Laura María',
      lastName: undefined,
      phone: '3009998877',
    });
    expect(profile.firstName).toBe('Laura María');
    expect(profile.email).toBe('laura@test.local');
  });
});
