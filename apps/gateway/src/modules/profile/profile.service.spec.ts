import { of, throwError } from 'rxjs';
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

  const participation = (
    id: number,
    studentCode: string,
    career?: string,
    semester?: string,
  ) => ({
    project: { id, name: `Project ${id}`, eventId: 1, courseId: 3, state: 'APPROVED' },
    studentCode,
    career,
    semester,
  });

  const build = (projectsService: any, authService: any = {}) => {
    const service = new ProfileService(authService, {
      getService: () => projectsService,
    } as any);
    service.onModuleInit();
    return service;
  };

  it('derives academic data from the most recent participation', async () => {
    const projectsService = {
      listUserParticipations: jest.fn(() =>
        of({
          participations: [
            participation(5, '2021001001', 'Ingeniería de Sistemas', '8'),
            participation(2, '2019001001', 'Ingeniería Industrial', '3'),
          ],
        }),
      ),
    };

    const profile = await build(projectsService).getProfile(user);

    expect(projectsService.listUserParticipations).toHaveBeenCalledWith({ userId: 10 });
    expect(profile.academic).toEqual({
      studentCode: '2021001001',
      career: 'Ingeniería de Sistemas',
      semester: '8',
      derived: true,
    });
    expect(profile.projects.map((p) => p.id)).toEqual([5, 2]);
    expect(profile.roles).toEqual(['User']);
  });

  it('skips placeholder values and falls back to older participations', async () => {
    const projectsService = {
      listUserParticipations: () =>
        of({
          participations: [
            participation(5, '2021001001', 'N/A', ''),
            participation(2, '2019001001', 'Ingeniería Industrial', '3'),
          ],
        }),
    };

    const profile = await build(projectsService).getProfile(user);

    expect(profile.academic.career).toBe('Ingeniería Industrial');
    expect(profile.academic.semester).toBe('3');
    expect(profile.academic.studentCode).toBe('2021001001');
  });

  it('returns empty academic data when the user has no projects', async () => {
    const profile = await build({ listUserParticipations: () => of({}) }).getProfile(user);

    expect(profile.academic).toEqual({
      studentCode: null,
      career: null,
      semester: null,
      derived: true,
    });
    expect(profile.projects).toEqual([]);
  });

  it('still returns the profile when project-service fails', async () => {
    const projectsService = {
      listUserParticipations: () => throwError(() => new Error('UNAVAILABLE')),
    };

    const profile = await build(projectsService).getProfile(user);

    expect(profile.email).toBe('laura@test.local');
    expect(profile.projects).toEqual([]);
  });

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
      { listUserParticipations: () => of({ participations: [] }) },
      authService,
    ).updateProfile(user, { firstName: 'Laura María', phone: '3009998877' });

    expect(authService.updateOwnProfile).toHaveBeenCalledWith({
      userId: 10,
      firstName: 'Laura María',
      lastName: undefined,
      phone: '3009998877',
    });
    expect(profile.firstName).toBe('Laura María');
    expect(profile.phone).toBe('3009998877');
    expect(profile.email).toBe('laura@test.local');
  });
});
