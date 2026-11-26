import { Clock, EmailJsAdapter } from '../providers/emailjs.adapter';

describe('EmailJsAdapter', () => {
  const email = {
    to: 'laura@test.local',
    subject: 'Hola',
    html: '<p>Hola</p>',
    text: 'Hola',
  };

  const config = {
    serviceId: 'service',
    templateId: 'template',
    publicKey: 'public',
    privateKey: 'private',
  };

  const ok = { status: 200, text: 'OK' };
  const tooManyRequests = { status: 429, text: 'Too Many Requests' };

  // Virtual time: sleep advances the clock instead of waiting
  const fakeClock = () => {
    let time = 0;
    const sleeps: number[] = [];
    const clock: Clock = {
      now: () => time,
      sleep: (ms) => {
        sleeps.push(ms);
        time += ms;
        return Promise.resolve();
      },
    };
    return { clock, sleeps, advance: (ms: number) => (time += ms) };
  };

  it('sends the rendered email with the EmailJS template parameters', async () => {
    const send = jest.fn().mockResolvedValue(ok);

    await new EmailJsAdapter(config, send, fakeClock().clock).send(email);

    expect(send).toHaveBeenCalledWith(
      'service',
      'template',
      {
        to_email: 'laura@test.local',
        subject: 'Hola',
        message_html: '<p>Hola</p>',
      },
      { publicKey: 'public', privateKey: 'private' },
    );
  });

  it('spaces requests 1 second apart, even when sent at the same time', async () => {
    const { clock } = fakeClock();
    const startedAt: number[] = [];
    const send = jest.fn(() => {
      startedAt.push(clock.now());
      return Promise.resolve(ok);
    });
    const adapter = new EmailJsAdapter(config, send, clock);

    await Promise.all([
      adapter.send(email),
      adapter.send(email),
      adapter.send(email),
    ]);

    expect(startedAt).toEqual([0, 1000, 2000]);
  });

  it('does not wait when the last request was more than 1 second ago', async () => {
    const { clock, sleeps, advance } = fakeClock();
    const adapter = new EmailJsAdapter(
      config,
      jest.fn().mockResolvedValue(ok),
      clock,
    );

    await adapter.send(email);
    advance(5000);
    await adapter.send(email);

    expect(sleeps).toEqual([]);
  });

  it('retries a 429 with a growing wait and succeeds', async () => {
    const { clock, sleeps } = fakeClock();
    const send = jest
      .fn()
      .mockRejectedValueOnce(tooManyRequests)
      .mockRejectedValueOnce(tooManyRequests)
      .mockResolvedValue(ok);

    await new EmailJsAdapter(config, send, clock).send(email);

    expect(send).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('fails after the last retry when EmailJS keeps answering 429', async () => {
    const send = jest.fn().mockRejectedValue(tooManyRequests);
    const adapter = new EmailJsAdapter(
      { ...config, maxRetries: 2 },
      send,
      fakeClock().clock,
    );

    await expect(adapter.send(email)).rejects.toThrow(
      'EmailJS send failed (429): Too Many Requests',
    );
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not retry errors other than 429', async () => {
    const send = jest
      .fn()
      .mockRejectedValue({ status: 400, text: 'Bad template' });

    await expect(
      new EmailJsAdapter(config, send, fakeClock().clock).send(email),
    ).rejects.toThrow('EmailJS send failed (400): Bad template');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
