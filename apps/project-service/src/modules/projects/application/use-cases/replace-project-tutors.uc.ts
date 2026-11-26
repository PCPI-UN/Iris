import { Inject, Injectable } from '@nestjs/common';
import { normalizeEmail } from '@app/common/utils/email.util';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import {
  PendingProjectTutorInput,
  ProjectTutorView,
} from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import { SetProjectTutorsUC } from './set-project-tutors.uc';
import { ListProjectTutorsUC } from './list-project-tutors.uc';

export interface ReplaceProjectTutorsInput {
  projectId: number;
  /** auth-service user making the change */
  actingUserId: number;
  tutorUserIds: number[];
  pendingTutors: PendingProjectTutorInput[];
  reason?: string;
  eventType?: string;
}

/** Pending tutors as the change log stores them: by email, in a stable order. */
const pendingTutorsLog = (
  pendings: { email: string; firstName: string; lastName?: string | null }[],
) =>
  pendings
    .map((p) => ({
      email: normalizeEmail(p.email),
      firstName: p.firstName,
      lastName: p.lastName ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

/**
 * Replaces the tutors of a project (PUT /projects/:id/tutors) and records a TUTORS entry in the
 * change log with the linked and pending tutors before and after; the tutors and the entry are
 * saved together under the project row lock, and a replacement that changes nothing records
 * nothing. On an APPROVED project the tutors are then activated (role and invitations), outside
 * the transaction.
 */
@Injectable()
export class ReplaceProjectTutorsUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly tutors: SetProjectTutorsUC,
    private readonly listTutors: ListProjectTutorsUC,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: ReplaceProjectTutorsInput): Promise<ProjectTutorView[]> {
    if (!input.projectId || input.projectId <= 0) {
      throw new ValidationError('projectId no es válido');
    }
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    // Validates the selection against auth-service before the transaction
    const resolved = await this.tutors.resolve({
      tutorUserIds: input.tutorUserIds,
      pendingTutors: input.pendingTutors,
    });

    await this.uow.run(async () => {
      // Two replacements of the same project run one after the other, so `before` is always
      // the list each one replaces
      await this.repo.lockProject(project.id);
      const before = {
        tutorUserIds: await this.repo.listTutorUserIds(project.id),
        pendingTutors: pendingTutorsLog(
          await this.repo.listPendingTutors(project.id),
        ),
      };
      await this.tutors.store(project.id, resolved);
      const entry = buildProjectChangeLogEntry({
        projectId: project.id,
        actorUserId: input.actingUserId,
        action: 'TUTORS',
        before,
        after: {
          tutorUserIds: resolved.userIds,
          pendingTutors: pendingTutorsLog(resolved.pendings),
        },
        reason: input.reason,
      });
      if (entry) await this.changeLog.create(entry);
    });

    if (project.state === 'APPROVED') {
      await this.tutors.activate(project.id, input.eventType);
    }
    return (await this.listTutors.execute([project.id])).get(project.id) ?? [];
  }
}
