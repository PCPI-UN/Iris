import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { EditableProfileFieldsGuard } from './editable-fields.guard';

describe('EditableProfileFieldsGuard', () => {
  const guard = new EditableProfileFieldsGuard();
  const contextWithBody = (body: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ body }) }),
    }) as unknown as ExecutionContext;

  it('allows a body with only editable fields', () => {
    expect(
      guard.canActivate(contextWithBody({ firstName: 'Laura', lastName: 'Gómez', phone: '3001112233' })),
    ).toBe(true);
  });

  it('allows an empty body', () => {
    expect(guard.canActivate(contextWithBody(undefined))).toBe(true);
  });

  it.each([
    [{ email: 'other@test.local' }, 'email'],
    [{ firstName: 'Laura', status: 'CONFIRMED' }, 'status'],
    [{ id: 99, firstName: 'Laura' }, 'id'],
    [{ userId: 99 }, 'userId'],
    [{ roleIds: [1] }, 'roleIds'],
    [{ password: 'Secret123@' }, 'password'],
    [{ studentCode: '2021001001', career: 'Sistemas' }, 'studentCode, career'],
  ])('rejects restricted fields %p', (body, fields) => {
    expect(() => guard.canActivate(contextWithBody(body))).toThrow(BadRequestException);
    expect(() => guard.canActivate(contextWithBody(body))).toThrow(fields);
  });
});
