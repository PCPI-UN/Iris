import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { EmailTemplate } from '@app/common/generated/notification';
import { SendEmailDto } from '../../../application/dto/send-email.dto';
import { buildValidationPipe } from '../validation-pipe';

describe('buildValidationPipe', () => {
  const pipe = buildValidationPipe();
  const metadata = { type: 'body' as const, metatype: SendEmailDto };
  const request = {
    to: 'laura@test.local',
    template: EmailTemplate.PLATFORM_INVITATION,
    params: { firstName: 'Laura' },
  };

  it('answers INVALID_ARGUMENT for an idempotency key over 255 characters', async () => {
    const error = await pipe
      .transform({ ...request, idempotencyKey: 'k'.repeat(256) }, metadata)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toMatchObject({
      code: status.INVALID_ARGUMENT,
      message: expect.stringContaining('idempotencyKey'),
    });
  });

  it('lets a valid request through with its params', async () => {
    await expect(
      pipe.transform({ ...request, idempotencyKey: 'invite-1' }, metadata),
    ).resolves.toMatchObject({ ...request, idempotencyKey: 'invite-1' });
  });
});
