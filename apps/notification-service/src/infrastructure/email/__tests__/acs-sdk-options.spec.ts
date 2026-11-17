const EmailClient = jest.fn().mockImplementation(() => ({
  beginSend: jest.fn(),
  generatedClient: { email: { getSendResult: jest.fn() } },
}));
jest.mock('@azure/communication-email', () => ({ EmailClient }));

import { sdkClient } from '../providers/acs.adapter';
import { resolveEmailProviders } from '../providers/email-providers';

describe('ACS SDK retry options', () => {
  beforeEach(() => EmailClient.mockClear());

  it('sets maxRetries on the EmailClient, 0 by default', () => {
    sdkClient('conn');
    sdkClient('conn', 2);

    expect(EmailClient).toHaveBeenNthCalledWith(1, 'conn', {
      retryOptions: { maxRetries: 0 },
    });
    expect(EmailClient).toHaveBeenNthCalledWith(2, 'conn', {
      retryOptions: { maxRetries: 2 },
    });
  });

  const env = (extra: Record<string, string>) => (key: string) =>
    ({
      EMAIL_PROVIDERS: 'acs',
      ACS_CONNECTION_STRING: 'conn',
      ACS_SENDER_ADDRESS: 'noreply@iris.test',
      ...extra,
    })[key];
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  it('reads ACS_MAX_RETRIES from the environment', () => {
    resolveEmailProviders(env({ ACS_MAX_RETRIES: '2' }), logger);
    resolveEmailProviders(env({}), logger);

    expect(EmailClient).toHaveBeenNthCalledWith(1, 'conn', {
      retryOptions: { maxRetries: 2 },
    });
    expect(EmailClient).toHaveBeenNthCalledWith(2, 'conn', {
      retryOptions: { maxRetries: 0 },
    });
  });

  it('fails to start on an invalid ACS_MAX_RETRIES instead of skipping ACS', () => {
    expect(() =>
      resolveEmailProviders(env({ ACS_MAX_RETRIES: '-1' }), logger),
    ).toThrow('ACS_MAX_RETRIES must be an integer');
  });
});
