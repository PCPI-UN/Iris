export interface GetStudentParticipationStatsDTO {
  /** Authenticated user; the gateway takes it from the session */
  userId: number;
  /** Email of the session user, to match the participant data captured at submission */
  email?: string;
}
