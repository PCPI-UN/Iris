import { Inject, Injectable } from '@nestjs/common';
import { EmailTemplate } from '@app/common/generated/notification';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import { Project, ProjectState } from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  ProjectStateChangeBlockedError,
  stateChangeBlock,
} from '../../domain/admin-state-change';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import {
  EVALUATION_SERVICE_PORT,
  EvaluationServicePort,
} from '../ports/evaluation-service.port';
import {
  approvalTemplate,
  ProjectApprovalEffects,
} from '../services/project-approval-effects.service';

const PROJECT_STATES: readonly ProjectState[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REQUEST_CHANGES',
];

/** States whose email shows the reason, which is then also stored in project.reason */
const STATES_WITH_REASON: readonly ProjectState[] = [
  'REJECTED',
  'REQUEST_CHANGES',
];

export interface AdminChangeProjectStateInput {
  projectId: number;
  actingUserId: number;
  /** undefined when the request did not bring a known state */
  state?: ProjectState;
  reason?: string;
  /** Email the participants with the template of the new state */
  notify?: boolean;
  /** Apply the change even with evaluations or published results */
  force?: boolean;
}

/** The event type as the email templates and invitations name it */
export const eventTypeName = (event: { eventType?: unknown } | null): string =>
  event?.eventType === 2 || event?.eventType === 'COMPETENCIA'
    ? 'Competition'
    : 'Exposition';

/** Email of a state, as the approve, reject and request-changes use cases send it; none for UNDER_REVIEW */
export const stateTemplate = (
  state: ProjectState,
  eventType: string,
): EmailTemplate | null => {
  switch (state) {
    case 'APPROVED':
      return approvalTemplate(eventType);
    case 'REJECTED':
      return eventType === 'Competition'
        ? EmailTemplate.PARTICIPANTS_REJECTED
        : EmailTemplate.PROJECT_REJECTED;
    case 'REQUEST_CHANGES':
      return EmailTemplate.REQUEST_CHANGES;
    default:
      return null;
  }
};

/**
 * Administrative correction of a project state: from any state to any other, with a
 * mandatory reason. A project with juror evaluations or of an event with published results
 * is not changed unless force is true. Becoming APPROVED has the effects of the normal
 * approval, and each change is stored in the change log in the same transaction (UnitOfWork).
 */
@Injectable()
export class AdminChangeProjectStateUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    @Inject(EVALUATION_SERVICE_PORT)
    private readonly evaluations: EvaluationServicePort,
    private readonly approvalEffects: ProjectApprovalEffects,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: AdminChangeProjectStateInput): Promise<Project> {
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    const target = input.state;
    if (!target || !PROJECT_STATES.includes(target)) {
      throw new ValidationError(
        'El estado no es válido: debe ser UNDER_REVIEW, APPROVED, REJECTED o REQUEST_CHANGES',
      );
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError(
        'El motivo del cambio de estado es obligatorio',
      );
    }
    if (project.state === target) {
      throw new ValidationError(`El proyecto ya está en el estado ${target}`);
    }

    // The event gives the published results and the event type of the emails
    const event = (await this.events.getEventById(project.eventId)) as {
      eventType?: unknown;
      resultsPublished?: boolean;
    } | null;
    if (!event)
      throw new NotFoundError('No se encontró el evento del proyecto');

    if (!input.force) {
      const block = stateChangeBlock({
        evaluationCount: await this.evaluations.countEvaluationsByProject(
          project.id,
        ),
        resultsPublished: event.resultsPublished === true,
        leavesApproved: project.state === 'APPROVED',
      });
      if (block) throw new ProjectStateChangeBlockedError(block);
    }

    // The states differ, so the entry is never null
    const entry = buildProjectChangeLogEntry({
      projectId: project.id,
      actorUserId: input.actingUserId,
      action: 'STATE',
      before: { state: project.state },
      after: { state: target },
      reason,
    })!;
    // The state and its change log entry are saved together; other services are called outside
    const updated = await this.uow.run(async () => {
      const changed = await this.repo.setProjectStateWithReason(
        project.id,
        target,
        // undefined keeps the current project.reason
        STATES_WITH_REASON.includes(target) ? reason : undefined,
      );
      await this.changeLog.create(entry);
      return changed;
    });

    const eventType = eventTypeName(event);
    // Tutor roles and invitations are what lets the tutors in, so they do not depend on notify
    if (target === 'APPROVED') {
      await this.approvalEffects.activateTutors(project.id, eventType);
    }
    const template = input.notify ? stateTemplate(target, eventType) : null;
    if (template !== null) {
      await this.approvalEffects.notifyPendingParticipantsWith(
        { id: project.id, name: project.name },
        template,
        target === 'APPROVED' ? undefined : reason,
      );
    }

    return updated;
  }
}
