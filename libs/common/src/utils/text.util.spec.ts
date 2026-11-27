import { normalizeText } from './text.util';

describe('normalizeText', () => {
  it('drops accents, extra spaces and case', () => {
    expect(normalizeText('  Dpt.   Ingeniería ')).toBe('dpt. ingenieria');
  });

  it('matches the composed and decomposed forms of an accent', () => {
    expect(normalizeText('Robótica')).toBe(normalizeText('Robótica'));
  });
});
