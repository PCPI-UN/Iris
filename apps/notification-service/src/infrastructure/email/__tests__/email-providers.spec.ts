import { resolveEmailProviders } from '../providers/email-providers';

describe('resolveEmailProviders', () => {
  const ACS = {
    ACS_CONNECTION_STRING: 'endpoint=https://iris.test/;accesskey=dGVzdA==',
    ACS_SENDER_ADDRESS: 'noreply@iris.test',
  };
  const EMAILJS = {
    EMAILJS_SERVICE_ID: 'service',
    EMAILJS_TEMPLATE_ID: 'template',
    EMAILJS_PUBLIC_KEY: 'public',
    EMAILJS_PRIVATE_KEY: 'private',
  };

  const resolve = (vars: Record<string, string>) => {
    const logger = { log: jest.fn(), warn: jest.fn() };
    const providers = resolveEmailProviders((key) => vars[key], logger);
    return { names: providers.map((p) => p.name), logger };
  };

  it('defaults to ACS as primary and EmailJS as fallback', () => {
    const { names, logger } = resolve({ ...ACS, ...EMAILJS });

    expect(names).toEqual(['acs', 'emailjs']);
    expect(logger.log).toHaveBeenCalledWith(
      'Email providers: primary=acs, fallback=emailjs',
    );
  });

  it('treats an empty EMAIL_PROVIDERS as the default', () => {
    const { names } = resolve({ ...ACS, ...EMAILJS, EMAIL_PROVIDERS: ' ' });

    expect(names).toEqual(['acs', 'emailjs']);
  });

  it('lets EmailJS be the primary', () => {
    const { names } = resolve({
      ...ACS,
      ...EMAILJS,
      EMAIL_PROVIDERS: ' EmailJS , acs ',
    });

    expect(names).toEqual(['emailjs', 'acs']);
  });

  it.each([
    ['ACS', ACS, 'acs'],
    ['EmailJS', EMAILJS, 'emailjs'],
  ])(
    'starts with only %s configured and logs that there is no fallback',
    (_label, vars, only) => {
      const { names, logger } = resolve(vars);

      expect(names).toEqual([only]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('skipped: missing'),
      );
      expect(logger.log).toHaveBeenCalledWith(
        `Email providers: only ${only} configured, no fallback`,
      );
    },
  );

  it('uses a single provider when the list has one', () => {
    const { names, logger } = resolve({
      ...ACS,
      ...EMAILJS,
      EMAIL_PROVIDERS: 'emailjs',
    });

    expect(names).toEqual(['emailjs']);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores a repeated provider', () => {
    const { names } = resolve({
      ...ACS,
      ...EMAILJS,
      EMAIL_PROVIDERS: 'acs,acs,emailjs',
    });

    expect(names).toEqual(['acs', 'emailjs']);
  });

  it('names the missing variables of a skipped provider', () => {
    const { logger } = resolve({ ...ACS, EMAILJS_SERVICE_ID: 'service' });

    expect(logger.warn).toHaveBeenCalledWith(
      'Email provider "emailjs" skipped: missing EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY',
    );
  });

  it('fails to start when no listed provider is configured', () => {
    expect(() => resolve({ ...ACS, EMAIL_PROVIDERS: 'emailjs' })).toThrow(
      'No email provider configured',
    );
  });

  it('fails to start on an unknown provider', () => {
    expect(() => resolve({ ...ACS, EMAIL_PROVIDERS: 'acs,sendgrid' })).toThrow(
      'EMAIL_PROVIDERS has unknown providers: sendgrid',
    );
  });
});
