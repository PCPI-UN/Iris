/** Status of a pending project participant, by name */
export type PendingParticipantStatus = 'PENDING' | 'INVITED' | 'JOINED';

/**
 * Pending participant status by name. project-service sends it as the proto enum number
 * (1, 2, 3) in a string field, so both forms are accepted; anything else reads as PENDING.
 * Shared here so gateway services do not import each other for it (see grpc-oneof.util).
 */
export function pendingStatus(status: unknown): PendingParticipantStatus {
  const value = String(status);
  if (value === 'JOINED' || value === '3') return 'JOINED';
  if (value === 'INVITED' || value === '2') return 'INVITED';
  return 'PENDING';
}
