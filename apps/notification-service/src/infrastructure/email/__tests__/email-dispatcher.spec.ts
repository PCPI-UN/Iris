import { EmailTemplate } from '@app/common/generated/notification';
import { EmailDispatcher } from '../email-dispatcher';
import { EmailTemplateRenderer } from '../email-template.renderer';
import {
  EmailInDoubtError,
  EmailProvider,
} from '../../../application/ports/email-provider.port';
import { EmailSendError } from '../../../application/ports/email.service.port';

describe('EmailDispatcher', () => {
  const rendered = { subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' };
  const request = {
    to: 'laura@test.local',
    template: EmailTemplate.PASSWORD_RESET,
    params: { name: 'Laura' },
  };

  const provider = (name: string, send: jest.Mock): EmailProvider => ({
    name,
    send,
  });

  const build = (...providers: EmailProvider[]) => {
    const render = jest.fn().mockResolvedValue(rendered);
    const dispatcher = new EmailDispatcher(providers, {
      render,
    } as unknown as EmailTemplateRenderer);
    return { dispatcher, render };
  };

  it('renders once and sends through the primary only', async () => {
    const primary = jest.fn().mockResolvedValue('sent');
    const fallback = jest.fn();
    const { dispatcher, render } = build(
      provider('acs', primary),
      provider('emailjs', fallback),
    );

    await expect(dispatcher.sendEmail(request)).resolves.toEqual({
      provider: 'acs',
      outcome: 'sent',
    });

    expect(render).toHaveBeenCalledWith(EmailTemplate.PASSWORD_RESET, {
      name: 'Laura',
    });
    expect(primary).toHaveBeenCalledWith(
      { to: 'laura@test.local', ...rendered },
      undefined,
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses the fallback when the primary fails', async () => {
    const fallback = jest.fn().mockResolvedValue('sent');
    const { dispatcher } = build(
      provider(
        'acs',
        jest.fn().mockRejectedValue(new Error('ACS send Failed')),
      ),
      provider('emailjs', fallback),
    );

    await expect(dispatcher.sendEmail(request)).resolves.toEqual({
      provider: 'emailjs',
      outcome: 'sent',
    });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('fails with every error and the last provider tried when all fail', async () => {
    const { dispatcher } = build(
      provider('emailjs', jest.fn().mockRejectedValue(new Error('429'))),
      provider(
        'acs',
        jest.fn().mockRejectedValue(new Error('ACS send Failed')),
      ),
    );

    const error = await dispatcher.sendEmail(request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({
      message: 'emailjs: 429; acs: ACS send Failed',
      provider: 'acs',
      failures: [
        { provider: 'emailjs', error: '429' },
        { provider: 'acs', error: 'ACS send Failed' },
      ],
    });
  });

  it('keeps the status, code and cause of the provider error', async () => {
    const sdkError = Object.assign(new Error('Service unavailable'), {
      statusCode: 503,
      code: 'ServiceUnavailable',
    });
    const { dispatcher } = build(
      provider(
        'acs',
        jest
          .fn()
          .mockRejectedValue(
            new Error('ACS gave no answer', { cause: sdkError }),
          ),
      ),
    );

    const error = (await dispatcher
      .sendEmail(request)
      .catch((e: unknown) => e)) as EmailSendError;

    expect(error.message).toBe(
      'acs: ACS gave no answer <- caused by: Service unavailable (status 503, code ServiceUnavailable)',
    );
    expect((error.cause as Error).cause).toBe(sdkError);
  });

  it('starts after the provider that reported it did not send the email', async () => {
    const primary = jest.fn();
    const fallback = jest.fn().mockResolvedValue('sent');
    const { dispatcher } = build(
      provider('acs', primary),
      provider('emailjs', fallback),
    );

    await expect(
      dispatcher.sendEmail({ ...request, after: 'acs' }),
    ).resolves.toEqual({ provider: 'emailjs', outcome: 'sent' });
    expect(primary).not.toHaveBeenCalled();
  });

  it('uses the whole chain when that provider is no longer configured', async () => {
    const primary = jest.fn().mockResolvedValue('sent');
    const { dispatcher } = build(provider('emailjs', primary));

    await expect(
      dispatcher.sendEmail({ ...request, after: 'acs' }),
    ).resolves.toEqual({ provider: 'emailjs', outcome: 'sent' });
  });

  it('fails when the only provider fails', async () => {
    const { dispatcher } = build(
      provider(
        'acs',
        jest.fn().mockRejectedValue(new Error('ACS send Failed')),
      ),
    );

    await expect(dispatcher.sendEmail(request)).rejects.toThrow(
      'acs: ACS send Failed',
    );
  });

  describe('with a provider that dedupes by operation id', () => {
    const acs = (send: jest.Mock, confirm = jest.fn()): EmailProvider => ({
      name: 'acs',
      send,
      confirm,
    });
    const inDoubt = () =>
      jest.fn().mockRejectedValue(new EmailInDoubtError('no answer'));

    it('gives the id only to that provider and stops when it accepted', async () => {
      const send = jest.fn().mockResolvedValue('accepted');
      const fallback = jest.fn();
      const { dispatcher } = build(acs(send), provider('emailjs', fallback));

      await expect(
        dispatcher.sendEmail({ ...request, ref: 'ref-1' }),
      ).resolves.toEqual({ provider: 'acs', outcome: 'accepted' });

      expect(send).toHaveBeenCalledWith(expect.anything(), 'ref-1');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('does not use the fallback when the provider gave no answer', async () => {
      const fallback = jest.fn();
      const { dispatcher } = build(
        acs(inDoubt()),
        provider('emailjs', fallback),
      );

      const error = (await dispatcher
        .sendEmail({ ...request, ref: 'ref-1' })
        .catch((e: unknown) => e)) as EmailSendError;

      expect(fallback).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(EmailSendError);
      expect(error).toMatchObject({ inDoubt: true, provider: 'acs' });
    });

    it('uses the fallback when the previous attempt also got no answer', async () => {
      const fallback = jest.fn().mockResolvedValue('sent');
      const { dispatcher } = build(
        acs(inDoubt()),
        provider('emailjs', fallback),
      );

      await expect(
        dispatcher.sendEmail({
          ...request,
          ref: 'ref-1',
          fallbackIfInDoubt: true,
        }),
      ).resolves.toEqual({ provider: 'emailjs', outcome: 'sent' });
    });

    it('stays in doubt when the fallback also fails', async () => {
      const { dispatcher } = build(
        acs(inDoubt()),
        provider('emailjs', jest.fn().mockRejectedValue(new Error('429'))),
      );

      await expect(
        dispatcher.sendEmail({
          ...request,
          ref: 'ref-1',
          fallbackIfInDoubt: true,
        }),
      ).rejects.toMatchObject({ inDoubt: true, provider: 'emailjs' });
    });

    it('is not in doubt when the provider rejected the email', async () => {
      const { dispatcher } = build(
        acs(jest.fn().mockRejectedValue(new Error('Unauthorized'))),
        provider('emailjs', jest.fn().mockRejectedValue(new Error('429'))),
      );

      await expect(
        dispatcher.sendEmail({ ...request, ref: 'ref-1' }),
      ).rejects.toMatchObject({ inDoubt: false });
    });

    it('reports whether the chain uses an id', () => {
      expect(build(acs(jest.fn())).dispatcher.usesRef()).toBe(true);
      expect(build(provider('emailjs', jest.fn())).dispatcher.usesRef()).toBe(
        false,
      );
    });

    it('confirms through the provider that accepted the email', async () => {
      const confirm = jest.fn().mockResolvedValue({ status: 'sent' });
      const { dispatcher } = build(acs(jest.fn(), confirm));

      await expect(dispatcher.confirm('acs', 'ref-1')).resolves.toEqual({
        status: 'sent',
      });
      expect(confirm).toHaveBeenCalledWith('ref-1');
    });

    it('fails to confirm with a provider that is not configured or cannot confirm', async () => {
      const { dispatcher } = build(provider('emailjs', jest.fn()));

      await expect(dispatcher.confirm('acs', 'ref-1')).rejects.toThrow(
        'cannot confirm',
      );
      await expect(dispatcher.confirm('emailjs', 'ref-1')).rejects.toThrow(
        'cannot confirm',
      );
    });
  });
});
