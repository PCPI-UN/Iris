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

  it('ignores statuses outside PENDING, SENT and FAILED', async () => {
    grpc.getEmailStatus.mockResolvedValue({
      deliveries: [
        delivery('k1', EmailDeliveryStatus.UNRECOGNIZED),
        delivery('k2', 99 as EmailDeliveryStatus),
        delivery('k3', EmailDeliveryStatus.SENT),
      ],
    });

    const result = await adapter.getEmailStatuses(['k1', 'k2', 'k3']);

    expect([...result.entries()]).toEqual([['k3', 'SENT']]);
  });

  it('keeps the statuses of the batches that answered when one fails', async () => {
    grpc.getEmailStatus
      .mockResolvedValueOnce({
        deliveries: [delivery('k0', EmailDeliveryStatus.SENT)],
      })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        deliveries: [delivery('k200', EmailDeliveryStatus.FAILED)],
      });
    const keys = Array.from({ length: 250 }, (_, i) => `k${i}`);

    const result = await adapter.getEmailStatuses(keys);

    expect(grpc.getEmailStatus).toHaveBeenCalledTimes(3);
    expect(result.get('k0')).toBe('SENT');
    expect(result.get('k200')).toBe('FAILED');
    expect(result.size).toBe(2);
  });
});
