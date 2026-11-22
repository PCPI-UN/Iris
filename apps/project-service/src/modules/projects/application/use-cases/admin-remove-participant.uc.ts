import { Inject, Injectable } from '@nestjs/common';
import { normalizeEmail } from '@app/common/utils/email.util';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  countMembers,
  enrolledLogValue,
  lastParticipant,
  ParticipantLogValue,
  pendingLogValue,
} from '../../domain/admin-participants';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';

export interface AdminRemoveParticipantInput {
  projectId: number;
  actingUserId: number;
  /** Enrolled participant to remove */
  userId?: number;
  /** Pending participant to remove */
  pendingId?: number;
  reason?: string;
}

/**
 * Administrative removal of a participant: an enrolled one (by user) or a pending one (by its
 * pending id). The project is never left without participants (400). Removing an enrolled
 * participant also removes their pending row in the project (same student code or email), so
 * they are free to join another project of the event. The removal and its PARTICIPANTS change
 * log entry are saved together, with the project row locked so two removals cannot both pass
 * the last-participant check.
 *
 * Invitations already sent are not cancelled (invitation-service is out of scope).
 */
@Injectable()
export class AdminRemoveParticipantUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: AdminRemoveParticipantInput): Promise<void> {
    const byUser = input.userId !== undefined && input.userId !== null;
    const byPending = input.pendingId !== undefined && input.pendingId !== null;
    if (byUser === byPending) {
      throw new ValidationError(
        'Indica el integrante inscrito (userId) o el pendiente (pendingId) que se quita',
      );
    }
    const id = (byUser ? input.userId : input.pendingId)!;
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('El ID del integrante no es válido');
    }

    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    // Name and email of an enrolled participant, read before the transaction (another service)
    const account = byUser
      ? ((await this.auth.findUsersByIds([id]))[0] ?? null)
      : null;

    await this.uow.run(async () => {
      await this.repo.lockProject(project.id);
      const participants = await this.repo.listParticipants(project.id);
      const pendings = await this.repo.listPendingParticipants(project.id);

      let removed: ParticipantLogValue;
      let pendingIds: number[];
      if (byUser) {
        const participant = participants.find((p) => p.userId === id);
        if (!participant) {
          throw new NotFoundError(
            `El usuario ${id} no es integrante inscrito del proyecto`,
          );
        }
        const email = account ? normalizeEmail(account.email) : null;
        pendingIds = pendings
          .filter(
            (p) =>
              p.studentCode === participant.studentCode ||
              (email !== null && normalizeEmail(p.email) === email),
          )
          .map((p) => p.pendingId!)
          .filter((pendingId) => pendingId !== undefined);
        removed = enrolledLogValue(participant, account);
      } else {
        const pending = pendings.find((p) => p.pendingId === id);
        if (!pending) {
          throw new NotFoundError(
            `No se encontró el integrante pendiente ${id} en el proyecto`,
          );
        }
        if (pending.status === 'JOINED') {
          throw new ValidationError(
            'Este integrante ya se inscribió en la plataforma: quítalo como integrante inscrito',
          );
        }
        pendingIds = [id];
        removed = pendingLogValue(pending);
      }

      const remaining = countMembers(
        participants.filter((p) => !byUser || p.userId !== id),
        pendings.filter((p) => !pendingIds.includes(p.pendingId!)),
      );
      if (remaining === 0) throw lastParticipant();

      if (byUser) await this.repo.removeParticipant(project.id, id);
      await this.repo.removePendingParticipants(project.id, pendingIds);
      // A removed participant always differs from null, so the entry is never null
      const entry = buildProjectChangeLogEntry({
        projectId: project.id,
        actorUserId: input.actingUserId,
        action: 'PARTICIPANTS',
        before: { participant: removed },
        after: { participant: null },
        reason: input.reason,
      })!;
      await this.changeLog.create(entry);
    });
  }
}
