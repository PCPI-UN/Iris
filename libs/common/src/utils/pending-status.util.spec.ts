import { pendingStatus } from './pending-status.util';

describe('pendingStatus', () => {
  it.each([
    ['PENDING', 'PENDING'],
    ['INVITED', 'INVITED'],
    ['JOINED', 'JOINED'],
    [1, 'PENDING'],
    ['2', 'INVITED'],
    [3, 'JOINED'],
    [undefined, 'PENDING'],
    ['other', 'PENDING'],
  ])('reads %p as %s', (input, expected) => {
    expect(pendingStatus(input)).toBe(expected);
  });
});
