import { EventServiceAdapter } from '../event-service.adapter';
import { EventGrpcClient } from '../event.grpc-client';

describe('EventServiceAdapter', () => {
  let grpc: { getEventMember: jest.Mock; listCategoriesByEvent: jest.Mock };
  let adapter: EventServiceAdapter;

  beforeEach(() => {
    grpc = { getEventMember: jest.fn(), listCategoriesByEvent: jest.fn() };
    adapter = new EventServiceAdapter(grpc as unknown as EventGrpcClient);
  });

  describe('getEventMember', () => {
    it('returns the active membership', async () => {
      grpc.getEventMember.mockResolvedValue({
        userId: 7,
        eventId: 10,
        roleId: 5,
        active: true,
      });

      await expect(adapter.getEventMember(7, 10)).resolves.toEqual({
        userId: 7,
        eventId: 10,
        roleId: 5,
      });
      expect(grpc.getEventMember).toHaveBeenCalledWith(7, 10);
    });

    it('returns null when event-service answers the empty membership', async () => {
      // event-service sends roleId 0 instead of NOT_FOUND; with proto defaults off it arrives as {}
      grpc.getEventMember.mockResolvedValue({});

      await expect(adapter.getEventMember(7, 10)).resolves.toBeNull();
    });
  });

  describe('listCategoriesByEvent', () => {
    it('reads every page', async () => {
      grpc.listCategoriesByEvent
        .mockResolvedValueOnce({
          categories: [
            { id: 1, name: 'Dpt. Ingeniería Civil y Ambiental', active: true },
          ],
          meta: { totalPages: 2 },
        })
        .mockResolvedValueOnce({
          categories: [
            { id: 2, name: 'Dpt. Ingeniería Industrial', active: false },
          ],
          meta: { totalPages: 2 },
        });

      await expect(adapter.listCategoriesByEvent(10)).resolves.toEqual([
        { id: 1, name: 'Dpt. Ingeniería Civil y Ambiental', active: true },
        { id: 2, name: 'Dpt. Ingeniería Industrial', active: false },
      ]);
      expect(grpc.listCategoriesByEvent).toHaveBeenNthCalledWith(1, 10, 1, 100);
      expect(grpc.listCategoriesByEvent).toHaveBeenNthCalledWith(2, 10, 2, 100);
    });

    it('returns an empty list for an event without categories', async () => {
      grpc.listCategoriesByEvent.mockResolvedValue({ meta: { totalPages: 1 } });

      await expect(adapter.listCategoriesByEvent(10)).resolves.toEqual([]);
    });
  });
});
