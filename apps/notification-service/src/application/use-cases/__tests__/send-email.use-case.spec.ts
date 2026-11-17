import { EmailTemplate } from '@app/common/generated/notification';
import { SendEmailUseCase } from '../send-email.use-case';
import { AttemptEmailDelivery } from '../attempt-email-delivery';
import { EmailDeliveryRepositoryPort } from '../../ports/email-delivery.repository.port';
import { buildDelivery } from './delivery.fixture';

describe('SendEmailUseCase', () => {
  const request = {
    to: 'laura@test.local',
    template: EmailTemplate.PLATFORM_INVITATION,
    params: { firstName: 'Laura' },
    idempotencyKey: ' invitation:abc:1700000000000 ',
  };

  const build = (created: boolean) => {
    const existing = buildDelivery({ status: 'SENT', attempts: 1 });
    const createOrGet = jest.fn().mockResolvedValue({
      delivery: created ? buildDelivery() : existing,
      created,
    });
    const execute = jest
      .fn()
      .mockResolvedValue(buildDelivery({ status: 'SENT', attempts: 1 }));
    const useCase = new SendEmailUseCase(
      { createOrGet } as unknown as EmailDeliveryRepositoryPort,
      { execute } as unknown as AttemptEmailDelivery,
    );
    return { useCase, createOrGet, execute, existing };
  };

  it('records the request and makes the first attempt', async () => {
    const { useCase, createOrGet, execute } = build(true);

    const result = await useCase.execute(request);

    expect(createOrGet).toHaveBeenCalledWith({
      idempotencyKey: 'invitation:abc:1700000000000',
      recipient: 'laura@test.local',
      template: 'PLATFORM_INVITATION',
      params: { firstName: 'Laura' },
      nextAttemptAt: expect.any(Date) as Date,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SENT');
  });

  it('returns the existing delivery and sends nothing for a repeated key', async () => {
    const { useCase, execute, existing } = build(false);

    await expect(useCase.execute(request)).resolves.toBe(existing);
    expect(execute).not.toHaveBeenCalled();
  });

  it('stores no key when the request has none', async () => {
    const { useCase, createOrGet } = build(true);

    await useCase.execute({ ...request, idempotencyKey: '  ' });

    expect(createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: null }),
    );
  });

  it('rejects an unknown template', async () => {
    const { useCase, createOrGet } = build(true);

    await expect(
      useCase.execute({ ...request, template: 99 as EmailTemplate }),
    ).rejects.toMatchObject({
      error: expect.objectContaining({ code: 3 }) as object,
    });
    expect(createOrGet).not.toHaveBeenCalled();
  });
});
