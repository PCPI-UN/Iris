import { protoToReadScope } from '../mappers';

describe('protoToReadScope', () => {
  it.each([
    [1, 'ACADEMIC_SCOPE_ALL', 'all'],
    [2, 'ACADEMIC_SCOPE_TUTORED', 'tutored'],
    [3, 'ACADEMIC_SCOPE_COURSE', 'course'],
    [4, 'ACADEMIC_SCOPE_DEPARTMENT', 'department'],
  ])('maps %s and %s to %s', (number, name, scope) => {
    expect(protoToReadScope(number)).toBe(scope);
    expect(protoToReadScope(name)).toBe(scope);
  });

  it.each([undefined, 0, 'ACADEMIC_SCOPE_UNSPECIFIED'])(
    '%s is no requested scope: the union',
    (value) => {
      expect(protoToReadScope(value)).toBeUndefined();
    },
  );
});
