import { EmailDeliveryStatus } from '@app/common/generated/notification';
import { NotificationServiceAdapter } from '../notification-service.adapter';
import { NotificationGrpcClient } from '../../../../../common/grpc-client/notification.grpc-client';

describe('NotificationServiceAdapter.getEmailStatuses', () => {
  let grpc: { getEmailStatus: jest.Mock };
  let adapter: NotificationServiceAdapter;

  const delivery = (key: string, status: EmailDeliveryStatus) => ({
    idempotencyKey: key,
    status,
  });

  beforeEach(() => {
    grpc = { getEmailStatus: jest.fn() };
    adapter = new NotificationServiceAdapter(
      grpc as unknown as NotificationGrpcClient,
    );
  });

  it('sends the keys as idempotencyKeys and maps each status by key', async () => {
    grpc.getEmailStatus.mockResolvedValue({
      deliveries: [
        delivery('k1', EmailDeliveryStatus.SENT),
        delivery('k2', EmailDeliveryStatus.PENDING),
        delivery('k3', EmailDeliveryStatus.FAILED),
      ],
    });

    const result = await adapter.getEmailStatuses(['k1', 'k2', 'k3', 'k4']);

    expect(grpc.getEmailStatus).toHaveBeenCalledWith(['k1', 'k2', 'k3', 'k4']);
    expect(result.get('k1')).toBe('SENT');
    expect(result.get('k2')).toBe('PENDING');
    expect(result.get('k3')).toBe('FAILED');
    expect(result.has('k4')).toBe(false);
  });

  it('splits the lookup into batches of 100', async () => {
    grpc.getEmailStatus.mockResolvedValue({ deliveries: [] });
    const keys = Array.from({ length: 250 }, (_, i) => `k${i}`);

    await adapter.getEmailStatuses(keys);

    expect(grpc.getEmailStatus).toHaveBeenCalledTimes(3);
    expect(
      (grpc.getEmailStatus.mock.calls as string[][][]).map(
        ([batch]) => batch.length,
      ),
    ).toEqual([100, 100, 50]);
  });

  it('propagates notification-service errors', async () => {
    grpc.getEmailStatus.mockRejectedValue(new Error('unavailable'));

    await expect(adapter.getEmailStatuses(['k1'])).rejects.toThrow(
      'unavailable',
    );
  });
});
