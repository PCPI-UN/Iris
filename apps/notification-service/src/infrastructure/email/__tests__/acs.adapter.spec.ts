import { AcsAdapter } from '../providers/acs.adapter';

describe('AcsAdapter', () => {
  const email = {
    to: 'laura@test.local',
    subject: 'Hola',
    html: '<p>Hola</p>',
    text: 'Hola',
  };

  const build = (beginSend: jest.Mock) =>
    new AcsAdapter(
      { connectionString: 'unused', senderAddress: 'noreply@iris.test' },
      { beginSend } as never,
    );

  const finishingWith = (result: unknown) => {
    const pollUntilDone = jest.fn().mockResolvedValue(result);
    return {
      beginSend: jest.fn().mockResolvedValue({ pollUntilDone }),
      pollUntilDone,
    };
  };

  it('sends HTML and plain text and waits for Azure to finish', async () => {
    const { beginSend, pollUntilDone } = finishingWith({
      id: 'op-1',
      status: 'Succeeded',
    });

    await build(beginSend).send(email);

    expect(beginSend).toHaveBeenCalledWith(
      {
        senderAddress: 'noreply@iris.test',
        recipients: { to: [{ address: 'laura@test.local' }] },
        content: { subject: 'Hola', plainText: 'Hola', html: '<p>Hola</p>' },
      },
      expect.objectContaining({ abortSignal: expect.anything() }),
    );
    expect(pollUntilDone).toHaveBeenCalled();
  });

  it.each(['Failed', 'Canceled'])(
    'treats a %s send as a failure',
    async (status) => {
      const { beginSend } = finishingWith({
        id: 'op-1',
        status,
        error: { message: 'Recipient rejected' },
      });

      await expect(build(beginSend).send(email)).rejects.toThrow(
        `ACS send ${status}: Recipient rejected`,
      );
    },
  );

  it('fails when Azure rejects the request itself', async () => {
    const beginSend = jest.fn().mockRejectedValue(new Error('Unauthorized'));

    await expect(build(beginSend).send(email)).rejects.toThrow('Unauthorized');
  });
});
