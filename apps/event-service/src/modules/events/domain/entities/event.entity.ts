import { EvaluationType, EventType } from '@app/common/generated/event';

export interface Event {
  id: number;
  name: string;
  description: string;
  accessCode: string;
  isPubliclyJoinable: boolean;
  inscriptionDeadline: Date;
  inscriptionCost?: number | null;
  evaluationsOpened: boolean;
  /** Participants can see their scores and awards */
  resultsPublished: boolean;
  startDate: Date;
  endDate: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: number;
  location: string;
  locationDetails?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  evaluationType?: EvaluationType | null;
  inscriptionRequirements?: string | null;
  minimumTeamSize?: number | null;
  aboutOurAllies?: string | null;
  eventType: EventType;
  collaborators: string[];
  organizers: string[];
  /** Academic term; NO_TERM_ID for the events created before terms existed */
  termId: number;
  /** A project of the event must belong to a course section (NRC); false for events that are not course work */
  requiresCourse: boolean;
}

