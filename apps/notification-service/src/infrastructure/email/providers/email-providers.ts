import { Logger } from '@nestjs/common';
import { EmailProvider } from '../../../application/ports/email-provider.port';
import { AcsAdapter } from './acs.adapter';
import { EmailJsAdapter } from './emailjs.adapter';

/** Ordered list: the first configured provider is the primary, the next one the fallback. */
export const EMAIL_PROVIDERS_ENV = 'EMAIL_PROVIDERS';
export const DEFAULT_EMAIL_PROVIDERS = 'acs,emailjs';

export const EMAIL_PROVIDERS = Symbol('EMAIL_PROVIDERS');

type Env = (key: string) => string | undefined;

/**
 * Each entry builds a provider from the environment, or returns the names of
 * the missing variables. A new provider is a new adapter plus one entry here.
 */
const REGISTRY: Record<
  string,
  (env: Env) => EmailProvider | { missing: string[] }
> = {
  acs: (env) => {
    const vars = pick(env, ['ACS_CONNECTION_STRING', 'ACS_SENDER_ADDRESS']);
    if ('missing' in vars) return vars;
    return new AcsAdapter({
      connectionString: vars.ACS_CONNECTION_STRING,
      senderAddress: vars.ACS_SENDER_ADDRESS,
    });
  },
  emailjs: (env) => {
    const vars = pick(env, [
      'EMAILJS_SERVICE_ID',
      'EMAILJS_TEMPLATE_ID',
      'EMAILJS_PUBLIC_KEY',
      'EMAILJS_PRIVATE_KEY',
    ]);
    if ('missing' in vars) return vars;
    return new EmailJsAdapter({
      serviceId: vars.EMAILJS_SERVICE_ID,
      templateId: vars.EMAILJS_TEMPLATE_ID,
      publicKey: vars.EMAILJS_PUBLIC_KEY,
      privateKey: vars.EMAILJS_PRIVATE_KEY,
    });
  },
};

/**
 * Builds the provider chain from EMAIL_PROVIDERS (default "acs,emailjs").
 * A listed provider without its variables is skipped with a warning, so the
 * service runs with only one configured. It fails to start if the list names
 * an unknown provider or none of the listed providers is configured.
 */
export function resolveEmailProviders(
  env: Env,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('EmailProviders'),
): EmailProvider[] {
  // docker-compose passes an unset variable as "", which also means the default
  const names = parseList(
    env(EMAIL_PROVIDERS_ENV)?.trim() || DEFAULT_EMAIL_PROVIDERS,
  );

  const unknown = names.filter((name) => !(name in REGISTRY));
  if (unknown.length) {
    throw new Error(
      `${EMAIL_PROVIDERS_ENV} has unknown providers: ${unknown.join(', ')}. ` +
        `Known: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }

  const providers: EmailProvider[] = [];
  for (const name of names) {
    const built = REGISTRY[name](env);
    if ('missing' in built) {
      logger.warn(
        `Email provider "${name}" skipped: missing ${built.missing.join(', ')}`,
      );
    } else {
      providers.push(built);
    }
  }

  if (!providers.length) {
    throw new Error(
      `No email provider configured. ${EMAIL_PROVIDERS_ENV}=${names.join(',')}`,
    );
  }

  const [primary, ...fallbacks] = providers.map((p) => p.name);
  logger.log(
    fallbacks.length
      ? `Email providers: primary=${primary}, fallback=${fallbacks.join(' -> ')}`
      : `Email providers: only ${primary} configured, no fallback`,
  );

  return providers;
}

function parseList(value: string): string[] {
  const names = value
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}

function pick<K extends string>(
  env: Env,
  keys: K[],
): Record<K, string> | { missing: string[] } {
  const values = {} as Record<K, string>;
  const missing: string[] = [];
  for (const key of keys) {
    const value = env(key)?.trim();
    if (value) values[key] = value;
    else missing.push(key);
  }
  return missing.length ? { missing } : values;
}
