import { EmailTemplate } from '@app/common/generated/notification';
import { EmailDispatcher } from '../email-dispatcher';
import { EmailTemplateRenderer } from '../email-template.renderer';
import { EmailProvider } from '../../../application/ports/email-provider.port';

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
    const primary = jest.fn().mockResolvedValue(undefined);
    const fallback = jest.fn();
    const { dispatcher, render } = build(
      provider('acs', primary),
      provider('emailjs', fallback),
    );

    await expect(dispatcher.sendEmail(request)).resolves.toEqual({
      success: true,
    });

    expect(render).toHaveBeenCalledWith(EmailTemplate.PASSWORD_RESET, {
      name: 'Laura',
    });
    expect(primary).toHaveBeenCalledWith({
      to: 'laura@test.local',
      ...rendered,
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses the fallback when the primary fails', async () => {
    const fallback = jest.fn().mockResolvedValue(undefined);
    const { dispatcher } = build(
      provider(
        'acs',
        jest.fn().mockRejectedValue(new Error('ACS send Failed')),
      ),
      provider('emailjs', fallback),
    );

    await expect(dispatcher.sendEmail(request)).resolves.toEqual({
      success: true,
    });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('fails when the primary and the fallback fail', async () => {
    const { dispatcher } = build(
      provider('emailjs', jest.fn().mockRejectedValue(new Error('429'))),
      provider(
        'acs',
        jest.fn().mockRejectedValue(new Error('ACS send Failed')),
      ),
    );

    await expect(dispatcher.sendEmail(request)).rejects.toThrow(
      'No se pudo enviar el correo',
    );
  });

  it('fails when the only provider fails', async () => {
    const { dispatcher } = build(
      provider(
        'acs',
        jest.fn().mockRejectedValue(new Error('ACS send Failed')),
      ),
    );

    await expect(dispatcher.sendEmail(request)).rejects.toThrow(
      'No se pudo enviar el correo',
    );
  });
});
