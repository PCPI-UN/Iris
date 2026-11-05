import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { ForbidUnknownFields } from './forbid-unknown-fields.guard';
import { OwnProfileFieldsDto } from '@app/common/dtos/own-profile.dto';

describe('ForbidUnknownFields', () => {
  const Guard = ForbidUnknownFields(OwnProfileFieldsDto);
  const guard = new Guard();
  const contextWithBody = (body: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ body }) }),
    }) as unknown as ExecutionContext;

  it('allows a body with only the DTO fields', () => {
    expect(
      guard.canActivate(contextWithBody({ firstName: 'Laura', lastName: 'Gómez', phone: '3001112233' })),
    ).toBe(true);
  });

  it('allows an empty body', () => {
    expect(guard.canActivate(contextWithBody(undefined))).toBe(true);
  });

  it('leaves value validation to the ValidationPipe', () => {
    expect(guard.canActivate(contextWithBody({ phone: '123' }))).toBe(true);
  });

  it.each([
    [{ email: 'other@test.local' }, 'email'],
    [{ firstName: 'Laura', status: 'CONFIRMED' }, 'status'],
    [{ id: 99, userId: 99 }, 'id, userId'],
    [{ roleIds: [1] }, 'roleIds'],
    [{ password: 'Secret123@' }, 'password'],
    [{ studentCode: '2021001001', career: 'Sistemas' }, 'studentCode, career'],
  ])('rejects fields outside the DTO %p', (body, fields) => {
    expect(() => guard.canActivate(contextWithBody(body))).toThrow(BadRequestException);
    expect(() => guard.canActivate(contextWithBody(body))).toThrow(fields);
  });
});
