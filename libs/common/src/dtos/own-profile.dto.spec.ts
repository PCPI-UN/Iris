import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OwnProfileFieldsDto } from './own-profile.dto';

describe('OwnProfileFieldsDto', () => {
  const check = (body: object) => {
    const dto = plainToInstance(OwnProfileFieldsDto, body);
    return { dto, errors: validateSync(dto).map((e) => e.property) };
  };

  it('trims values before validating them', () => {
    const { dto, errors } = check({ firstName: '  Laura  ', lastName: ' Gómez ', phone: ' 3001234567 ' });

    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ firstName: 'Laura', lastName: 'Gómez', phone: '3001234567' });
  });

  it('rejects a first name made only of spaces', () => {
    expect(check({ firstName: '      ' }).errors).toEqual(['firstName']);
  });

  it('rejects a first name shorter than 2 characters after trimming', () => {
    expect(check({ firstName: ' a ' }).errors).toEqual(['firstName']);
  });

  it('allows clearing the last name', () => {
    const { dto, errors } = check({ lastName: '   ' });
    expect(errors).toEqual([]);
    expect(dto.lastName).toBe('');
  });

  it.each(['123', '+573001234567', '30012345678', 'abcdefghij'])(
    'rejects the phone %p',
    (phone) => {
      expect(check({ phone }).errors).toEqual(['phone']);
    },
  );

  it('accepts a 10-digit Colombian phone', () => {
    expect(check({ phone: '3001234567' }).errors).toEqual([]);
  });
});
