/**
 * Canonical form of an email address: trimmed and lowercased.
 * Emails are compared case-insensitively across the platform.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
