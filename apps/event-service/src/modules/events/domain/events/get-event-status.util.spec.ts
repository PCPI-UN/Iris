import { getEventStatus } from './get-event-status.util';
import { EventStatus } from './event-status.enum';

// Event stored by event-service with times in Bogotá converted to UTC:
// deadline 21 Nov 2026 00:00, start 1 Dec 2026 08:00, end 3 Dec 2026 18:00 (Bogotá)
const DEADLINE = new Date('2026-11-21T05:00:00.000Z');
const START = new Date('2026-12-01T13:00:00.000Z');
const END = new Date('2026-12-03T23:00:00.000Z');

describe('getEventStatus: inscription deadline in Bogotá time', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const statusAt = (now: string, deadline: Date | string = DEADLINE) => {
    jest.setSystemTime(new Date(now));
    return getEventStatus(START, END, deadline);
  };

  // These run the same on a server in UTC (production containers) and on a PC in Colombia
  it.each([
    ['7:00 PM in Bogotá of the deadline day (midnight UTC)', '2026-11-22T00:00:00.000Z'],
    ['11:30 PM in Bogotá of the deadline day', '2026-11-22T04:30:00.000Z'],
  ])('keeps inscriptions open at %s', (_case, now) => {
    expect(statusAt(now)).toBe(EventStatus.UPCOMING);
  });

  it('closes inscriptions at 00:00 in Bogotá of the next day', () => {
    expect(statusAt('2026-11-22T05:00:00.000Z')).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it('takes the deadline as an ISO string too', () => {
    expect(statusAt('2026-11-22T04:30:00.000Z', DEADLINE.toISOString())).toBe(EventStatus.UPCOMING);
  });

  it('still reports AVAILABLE and CLOSED by the exact start and end instants', () => {
    expect(statusAt('2026-12-01T13:00:00.000Z')).toBe(EventStatus.AVAILABLE);
    expect(statusAt('2026-12-03T23:00:01.000Z')).toBe(EventStatus.CLOSED);
  });
});
