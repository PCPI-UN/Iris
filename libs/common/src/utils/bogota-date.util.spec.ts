import {
  bogotaDay,
  isInscriptionDeadlinePassed,
  startOfBogotaDay,
} from './bogota-date.util';

// Deadline as stored by event-service for "21 Nov 2026": 00:00 in Bogotá = 05:00 UTC
const DEADLINE = new Date('2026-11-21T05:00:00.000Z');

describe('bogota-date.util', () => {
  it('reads the day in Bogotá, not in the zone of the server', () => {
    // 22 Nov 04:30 UTC is still 21 Nov 23:30 in Bogotá
    expect(bogotaDay(new Date('2026-11-22T04:30:00.000Z'))).toBe('2026-11-21');
    expect(bogotaDay('2026-11-22T05:00:00.000Z')).toBe('2026-11-22');
  });

  it('gives the instant the Bogotá day starts', () => {
    expect(
      startOfBogotaDay(new Date('2026-11-22T04:30:00.000Z')).toISOString(),
    ).toBe('2026-11-21T05:00:00.000Z');
  });

  describe('isInscriptionDeadlinePassed', () => {
    it.each([
      ['the morning of the deadline day', '2026-11-21T13:00:00.000Z'],
      [
        '7:00 PM in Bogotá of the deadline day (midnight UTC)',
        '2026-11-22T00:00:00.000Z',
      ],
      ['11:30 PM in Bogotá of the deadline day', '2026-11-22T04:30:00.000Z'],
      [
        '23:59:59.999 in Bogotá of the deadline day',
        '2026-11-22T04:59:59.999Z',
      ],
    ])('keeps inscriptions open at %s', (_case, now) => {
      expect(isInscriptionDeadlinePassed(DEADLINE, new Date(now))).toBe(false);
    });

    it('closes them at 00:00 in Bogotá of the next day', () => {
      expect(
        isInscriptionDeadlinePassed(
          DEADLINE,
          new Date('2026-11-22T05:00:00.000Z'),
        ),
      ).toBe(true);
    });

    it('takes the deadline as an ISO string too (as event-service sends it over gRPC)', () => {
      expect(
        isInscriptionDeadlinePassed(
          DEADLINE.toISOString(),
          new Date('2026-11-22T04:30:00.000Z'),
        ),
      ).toBe(false);
    });
  });
});
