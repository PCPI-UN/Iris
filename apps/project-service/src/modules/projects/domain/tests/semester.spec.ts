import { semesterOf } from '../semester';

describe('semesterOf', () => {
  it('maps January to June to AAAA-10', () => {
    expect(semesterOf('2026-01-15T15:00:00.000Z')).toBe('2026-10');
    expect(semesterOf('2026-06-20T15:00:00.000Z')).toBe('2026-10');
  });

  it('maps July to December to AAAA-30', () => {
    expect(semesterOf('2026-07-01T15:00:00.000Z')).toBe('2026-30');
    expect(semesterOf('2026-12-31T15:00:00.000Z')).toBe('2026-30');
  });

  it('reads the date in Bogota time (UTC-5)', () => {
    // 30 June 22:00 in Bogota is already 1 July in UTC
    expect(semesterOf('2026-07-01T03:00:00.000Z')).toBe('2026-10');
    // 31 December 21:00 in Bogota is already 1 January in UTC
    expect(semesterOf('2027-01-01T02:00:00.000Z')).toBe('2026-30');
    // 1 July 00:00 in Bogota
    expect(semesterOf('2026-07-01T05:00:00.000Z')).toBe('2026-30');
  });

  it('accepts Date objects', () => {
    expect(semesterOf(new Date('2025-03-10T12:00:00.000Z'))).toBe('2025-10');
  });

  it('returns null for missing or invalid dates', () => {
    expect(semesterOf(undefined)).toBeNull();
    expect(semesterOf('')).toBeNull();
    expect(semesterOf('not a date')).toBeNull();
  });
});
