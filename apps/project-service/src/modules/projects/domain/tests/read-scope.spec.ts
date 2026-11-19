import { resolveReadScope } from '../read-scope';

describe('resolveReadScope', () => {
  it('read_all reads every project', () => {
    expect(resolveReadScope(5, ['read:academic_projects', 'read_all:academic_projects'])).toEqual({ all: true });
  });

  it('read_all wins over the other scope permissions the user also holds', () => {
    expect(resolveReadScope(5, ['read_tutored:academic_projects', 'read_all:academic_projects'])).toEqual({ all: true });
  });

  it.each([
    ['read_tutored', ['read_tutored:academic_projects'], { tutored: true, ofCourses: false, ofDepartment: false }],
    ['read_course', ['read_course:academic_projects'], { tutored: false, ofCourses: true, ofDepartment: false }],
    ['read_department', ['read_department:academic_projects'], { tutored: false, ofCourses: false, ofDepartment: true }],
    [
      'read_course and read_tutored',
      ['read_course:academic_projects', 'read_tutored:academic_projects'],
      { tutored: true, ofCourses: true, ofDepartment: false },
    ],
  ])('%s reads the projects of those relations', (_name, permissions, relations) => {
    expect(resolveReadScope(5, permissions)).toEqual({ all: false, userId: 5, ...relations });
  });

  it.each([
    ['no permission', []],
    // Opens the gateway endpoints, but grants no project by itself
    ['only read:academic_projects', ['read:academic_projects']],
    ['unrelated permissions', ['read:grades', 'read:events']],
  ])('%s reads nothing', (_name, permissions) => {
    expect(resolveReadScope(5, permissions)).toBeNull();
  });
});
