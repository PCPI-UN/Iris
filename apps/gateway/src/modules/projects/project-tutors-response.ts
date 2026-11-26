import { ProjectTutor } from '@app/common/generated/project';

/**
 * Keeps only the fields of each tutor. The gRPC client (`oneofs: true`) adds a `_field` key
 * for every `optional` field (`_userId: 'userId'`), which must not reach the HTTP response.
 */
export function toProjectTutorsResponse(
  tutors?: ProjectTutor[],
): ProjectTutor[] {
  return (tutors ?? []).map(
    ({ userId, firstName, lastName, pending, email }) => ({
      userId,
      firstName,
      lastName,
      pending,
      email,
    }),
  );
}
