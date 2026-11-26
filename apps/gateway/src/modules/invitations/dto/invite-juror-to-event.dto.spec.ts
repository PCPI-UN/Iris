import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InviteJurorToEventDto } from './invite-juror-to-event.dto';

const errorsFor = async (payload: Record<string, unknown>) => {
  const errors = await validate(
    plainToInstance(InviteJurorToEventDto, payload),
  );
  return errors.map((error) => error.property);
};

describe('InviteJurorToEventDto', () => {
  const base = {
    email: 'ana.perez@uninorte.edu.co',
    eventType: 'Exposition',
    firstName: 'Ana Pérez Ríos',
  };

  it('accepts a juror without last name', async () => {
    expect(await errorsFor(base)).toEqual([]);
  });

  it('accepts a juror with last name', async () => {
    expect(await errorsFor({ ...base, lastName: 'Pérez' })).toEqual([]);
  });

  it('requires the first name', async () => {
    expect(
      await errorsFor({ email: base.email, eventType: base.eventType }),
    ).toEqual(['firstName']);
  });

  it('rejects a last name that is not text', async () => {
    expect(await errorsFor({ ...base, lastName: 42 })).toEqual(['lastName']);
  });
});
