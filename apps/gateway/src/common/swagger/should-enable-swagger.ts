/**
 * Decides whether the gateway publishes Swagger UI at /api/docs.
 *
 * Swagger exposes the full API map, so it stays off in production unless
 * someone turns it on on purpose with SWAGGER_ENABLED=true.
 */
export function shouldEnableSwagger(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED === 'true';
}
