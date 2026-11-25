import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcademicScope } from '@app/common/generated/project';
import {
  ACADEMIC_PROFILES,
  AcademicProfile,
  academicProfilesOf,
  profileScope,
} from '../academic-profiles';
import {
  AcademicEventQueryDto,
  AcademicProfileQueryDto,
  GetAcademicGradesDto,
  ListAcademicProjectsDto,
} from '../dto/academic-query.dto';
import { AppUser } from '../../auth/types/app-user.type';

const user = (roles: string[]): AppUser =>
  ({
    id: 5,
    platformRoles: roles.map((name, i) => ({
      id: i + 1,
      name,
      scope: 'PLATFORM',
    })),
    platformPermissions: [],
  }) as unknown as AppUser;

describe('academic profiles', () => {
  it('maps each profile to its role and scope', () => {
    expect(ACADEMIC_PROFILES).toEqual({
      PROFESSOR: {
        role: 'Professor',
        scope: AcademicScope.ACADEMIC_SCOPE_COURSE,
      },
      TUTOR: { role: 'Tutor', scope: AcademicScope.ACADEMIC_SCOPE_TUTORED },
      DIRECTOR: {
        role: 'DepartmentDirector',
        scope: AcademicScope.ACADEMIC_SCOPE_DEPARTMENT,
      },
      DEAN: { role: 'Dean', scope: AcademicScope.ACADEMIC_SCOPE_ALL },
    });
  });

  it.each([
    ['Professor', ['Professor'], ['PROFESSOR']],
    ['Tutor', ['Tutor'], ['TUTOR']],
    ['DepartmentDirector', ['DepartmentDirector'], ['DIRECTOR']],
    ['Dean', ['Dean'], ['DEAN']],
    // Fixed order, whatever the order of the roles
    [
      'Tutor and Professor',
      ['Tutor', 'User', 'Professor'],
      ['PROFESSOR', 'TUTOR'],
    ],
    ['Admin', ['Admin'], []],
    ['FacultyAdmin', ['FacultyAdmin', 'User'], []],
    ['no role', [], []],
  ])('%s', (_name, roles, profiles) => {
    expect(academicProfilesOf(user(roles))).toEqual(profiles);
  });

  it('a user without platformRoles has no profile', () => {
    expect(academicProfilesOf({ id: 5 } as unknown as AppUser)).toEqual([]);
  });

  it('profileScope gives the scope of a profile the user holds', () => {
    expect(
      profileScope(user(['Tutor', 'Professor']), AcademicProfile.TUTOR),
    ).toBe(AcademicScope.ACADEMIC_SCOPE_TUTORED);
  });

  it('profileScope is a 403 for a profile the user lacks', () => {
    expect(() => profileScope(user(['Admin']), AcademicProfile.DEAN)).toThrow(
      ForbiddenException,
    );
  });
});

describe('profile query parameter', () => {
  const errors = async (dto: new () => object, query: object) =>
    (await validate(plainToInstance(dto, query))).map((e) => e.property);

  it.each([
    ['projects', ListAcademicProjectsDto, {}],
    ['events and projects/:id', AcademicProfileQueryDto, {}],
    ['registrations', AcademicEventQueryDto, { eventId: '4' }],
    ['grades', GetAcademicGradesDto, { eventId: '4' }],
  ])('%s require it', async (_name, dto, query) => {
    expect(await errors(dto, query)).toEqual(['profile']);
    expect(await errors(dto, { ...query, profile: 'ADMIN' })).toEqual([
      'profile',
    ]);
    expect(await errors(dto, { ...query, profile: 'TUTOR' })).toEqual([]);
  });
});
