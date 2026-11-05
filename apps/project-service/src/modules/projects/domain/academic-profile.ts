import { UserParticipation } from './entities/project.entity';

export interface AcademicProfile {
  studentCode: string | null;
  career: string | null;
  semester: string | null;
}

// Values written to fill legacy rows when the career column was added; they carry no information.
// semester was backfilled with '1', which is also a real value, so it cannot be filtered out:
// on old rows the derived semester may not be accurate.
const NON_INFORMATIVE = new Set(['', 'N/A']);

const informative = (value?: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return NON_INFORMATIVE.has(trimmed) ? null : trimmed;
};

/**
 * Derives the user's academic data from their participations, ordered from the
 * most recent project. Each field takes the most recent informative value, so a
 * newer submission wins over older ones.
 */
export function deriveAcademicProfile(participations: UserParticipation[]): AcademicProfile {
  const mostRecent = (pick: (p: UserParticipation) => string | null | undefined) =>
    participations.map((p) => informative(pick(p))).find((v) => v !== null) ?? null;

  return {
    studentCode: mostRecent((p) => p.studentCode),
    career: mostRecent((p) => p.career),
    semester: mostRecent((p) => p.semester),
  };
}
