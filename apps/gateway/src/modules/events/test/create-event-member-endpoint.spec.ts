import { Reflector } from '@nestjs/core';
import { EventsController } from '../events.controller';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';

describe('POST /events/members', () => {
  const reflector = new Reflector();
  const handler = Object.getOwnPropertyDescriptor(
    EventsController.prototype,
    'createEventMember',
  )?.value as () => unknown;

  it('is not public, so the global JWT guard requires a session', () => {
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it('requires the create:event-members permission', () => {
    expect(reflector.get(PERMISSIONS_KEY, handler)).toEqual([
      'create:event-members',
    ]);
  });
});
