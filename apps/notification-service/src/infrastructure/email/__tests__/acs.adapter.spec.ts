import { AcsAdapter, sdkClient } from '../providers/acs.adapter';
import { EmailInDoubtError } from '../../../application/ports/email-provider.port';

describe('AcsAdapter', () => {
  const email = {
    to: 'laura@test.local',
    subject: 'Hola',
    html: '<p>Hola</p>',
    text: 'Hola',
  };

  const build = (client: {
    beginSend?: jest.Mock;
    getSendResult?: jest.Mock;
  }) =>
    new AcsAdapter(
      { connectionString: 'unused', senderAddress: 'noreply@iris.test' },
      {
        beginSend: jest.fn(),
        getSendResult: jest.fn(),
        ...client,
      },
    );

  type OnResponse = (response: {
    request: { method: string };
    status: number;
  }) => void;

  /** beginSend that gets the given POST status, then resolves or fails */
  const postAnswering = (status: number, error?: Error) =>
    jest.fn((_message: unknown, options: { onResponse: OnResponse }) => {
      options.onResponse({ request: { method: 'POST' }, status });
      return error ? Promise.reject(error) : Promise.resolve({});
    });

  const restError = (props: { statusCode?: number; code?: string }) =>
    Object.assign(new Error('RestError'), props);

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('expected a failure');
      },
      (error: unknown) => error as Error,
    );

  describe('send', () => {
    it('sends HTML and plain text with the operation id and returns once Azure accepted it', async () => {
      const beginSend = postAnswering(202);

      await expect(build({ beginSend }).send(email, 'ref-1')).resolves.toBe(
        'accepted',
      );

      expect(beginSend).toHaveBeenCalledWith(
        {
          senderAddress: 'noreply@iris.test',
          recipients: { to: [{ address: 'laura@test.local' }] },
          content: { subject: 'Hola', plainText: 'Hola', html: '<p>Hola</p>' },
        },
        expect.objectContaining({
          operationId: 'ref-1',
          abortSignal: expect.any(AbortSignal) as AbortSignal,
        }),
      );
    });

    it('is accepted when only the status read after the 202 fails', async () => {
      const beginSend = postAnswering(202, restError({ statusCode: 503 }));

      await expect(build({ beginSend }).send(email, 'ref-1')).resolves.toBe(
        'accepted',
      );
    });

    it('needs an operation id', async () => {
      const beginSend = jest.fn();

      await expect(build({ beginSend }).send(email)).rejects.toThrow(
        'operation id',
      );
      expect(beginSend).not.toHaveBeenCalled();
    });

    describe('when the id was already used', () => {
      const taken = restError({
        statusCode: 400,
        code: 'OperationIdAlreadyExists',
      });

      it.each([
        ['Succeeded', 'sent'],
        ['Running', 'accepted'],
        ['NotStarted', 'accepted'],
      ])('reads the earlier send: %s gives %s', async (status, outcome) => {
        const getSendResult = jest.fn().mockResolvedValue({ status });
        const adapter = build({
          beginSend: postAnswering(400, taken),
          getSendResult,
        });

        await expect(adapter.send(email, 'ref-1')).resolves.toBe(outcome);
        expect(getSendResult).toHaveBeenCalledWith('ref-1', expect.anything());
      });

      it('fails when the earlier send failed', async () => {
        const adapter = build({
          beginSend: postAnswering(400, taken),
          getSendResult: jest.fn().mockResolvedValue({
            status: 'Failed',
            error: { message: 'Recipient rejected' },
          }),
        });

        const error = await failure(adapter.send(email, 'ref-1'));

        expect(error).not.toBeInstanceOf(EmailInDoubtError);
        expect(error.message).toBe('ACS send Failed: Recipient rejected');
      });

      it('is accepted when the earlier send cannot be read now', async () => {
        const adapter = build({
          beginSend: postAnswering(400, taken),
          getSendResult: jest.fn().mockRejectedValue(new Error('timeout')),
        });

        await expect(adapter.send(email, 'ref-1')).resolves.toBe('accepted');
      });
    });

    it.each([
      [
        'a timeout',
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ],
      ['a 5xx', restError({ statusCode: 503 })],
      ['a connection reset', restError({ code: 'ECONNRESET' })],
    ])('is in doubt after %s', async (_case, error) => {
      const adapter = build({ beginSend: jest.fn().mockRejectedValue(error) });

      const thrown = await failure(adapter.send(email, 'ref-1'));

      expect(thrown).toBeInstanceOf(EmailInDoubtError);
      expect(thrown.cause).toBe(error);
    });

    it.each([
      ['a 4xx', restError({ statusCode: 401, code: 'Unauthorized' })],
      ['a refused connection', restError({ code: 'ECONNREFUSED' })],
      ['an unknown host', restError({ code: 'ENOTFOUND' })],
    ])('is rejected after %s', async (_case, error) => {
      const adapter = build({ beginSend: jest.fn().mockRejectedValue(error) });

      const thrown = await failure(adapter.send(email, 'ref-1'));

      expect(thrown).toBe(error);
    });
  });

  describe('confirm', () => {
    it.each([
      ['Succeeded', { status: 'sent' }],
      ['Running', { status: 'pending' }],
      ['NotStarted', { status: 'pending' }],
      [
        'Failed',
        { status: 'failed', error: 'ACS send Failed: Recipient rejected' },
      ],
      [
        'Canceled',
        { status: 'failed', error: 'ACS send Canceled: Recipient rejected' },
      ],
    ])('maps %s', async (status, expected) => {
      const getSendResult = jest.fn().mockResolvedValue({
        status,
        error: { message: 'Recipient rejected' },
      });

      await expect(build({ getSendResult }).confirm('ref-1')).resolves.toEqual(
        expected,
      );
      expect(getSendResult).toHaveBeenCalledWith(
        'ref-1',
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal) as AbortSignal,
        }),
      );
    });
  });

  it('builds the SDK client with the status read of the installed version', () => {
    const client = sdkClient(
      'endpoint=https://iris-test.communication.azure.com/;accesskey=dGVzdA==',
    );

    expect(typeof client.beginSend).toBe('function');
    expect(typeof client.getSendResult).toBe('function');
  });
});
