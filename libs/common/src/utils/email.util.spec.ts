import { normalizeEmail } from './email.util';

describe('normalizeEmail', () => {
  it('trims and lowercases the email', () => {
    expect(normalizeEmail('  Ana.Perez@Uninorte.EDU.co ')).toBe(
      'ana.perez@uninorte.edu.co',
    );
  });

  it('keeps an already normalized email unchanged', () => {
    expect(normalizeEmail('ana.perez@uninorte.edu.co')).toBe(
      'ana.perez@uninorte.edu.co',
    );
  });
});
