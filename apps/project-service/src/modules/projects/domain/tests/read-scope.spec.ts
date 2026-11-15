import { resolveReadScope } from '../read-scope';

describe('resolveReadScope', () => {
  it.each([
    ['Admin', 1],
    ['FacultyAdmin', 6],
    ['Dean', 7],
  ])('%s reads every project', (_name, roleId) => {
    expect(resolveReadScope(5, [roleId])).toEqual({ all: true });
  });

  it('a read-all role wins over the academic roles the user also holds', () => {
    expect(resolveReadScope(5, [10, 7])).toEqual({ all: true });
  });

  it.each([
    ['Tutor', [10], { asTutor: true, asProfessor: false, asDirector: false }],
    ['Professor', [9], { asTutor: false, asProfessor: true, asDirector: false }],
    ['DepartmentDirector', [8], { asTutor: false, asProfessor: false, asDirector: true }],
    ['Professor and Tutor', [9, 10], { asTutor: true, asProfessor: true, asDirector: false }],
  ])('%s reads the projects of their relations', (_name, roleIds, relations) => {
    expect(resolveReadScope(5, roleIds)).toEqual({ all: false, userId: 5, ...relations });
  });

  it.each([
    ['no role', []],
    ['User, EventManager and Juror', [3, 2, 4]],
  ])('%s reads nothing', (_name, roleIds) => {
    expect(resolveReadScope(5, roleIds)).toBeNull();
  });
});
