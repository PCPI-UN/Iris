const MAX_CAUSES = 3;

/**
 * One line with what is known about a provider error: its message, the HTTP
 * status and error code when the SDK sets them, and the chain of causes.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (
    current !== undefined &&
    current !== null &&
    parts.length <= MAX_CAUSES
  ) {
    parts.push(describeOne(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(' <- caused by: ');
}

function describeOne(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const { statusCode, code } = error as {
    statusCode?: unknown;
    code?: unknown;
  };
  const details = [
    typeof statusCode === 'number' ? `status ${statusCode}` : null,
    typeof code === 'string' && code ? `code ${code}` : null,
  ].filter(Boolean);
  return details.length
    ? `${error.message} (${details.join(', ')})`
    : error.message;
}
