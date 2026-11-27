import { shouldEnableSwagger } from './should-enable-swagger';

describe('shouldEnableSwagger', () => {
  it('is on outside production when SWAGGER_ENABLED is not set', () => {
    expect(shouldEnableSwagger({ NODE_ENV: 'development' })).toBe(true);
  });

  it('is on outside production when SWAGGER_ENABLED is true', () => {
    expect(
      shouldEnableSwagger({ NODE_ENV: 'development', SWAGGER_ENABLED: 'true' }),
    ).toBe(true);
  });

  it('is off in production when SWAGGER_ENABLED is not set', () => {
    expect(shouldEnableSwagger({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is on in production when SWAGGER_ENABLED is true', () => {
    expect(
      shouldEnableSwagger({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toBe(true);
  });

  it('stays off in production for any SWAGGER_ENABLED value other than true', () => {
    expect(
      shouldEnableSwagger({ NODE_ENV: 'production', SWAGGER_ENABLED: 'false' }),
    ).toBe(false);
    expect(
      shouldEnableSwagger({ NODE_ENV: 'production', SWAGGER_ENABLED: 'TRUE' }),
    ).toBe(false);
  });
});
