import { Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { normalizeEmail } from '@app/common/utils/email.util';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PendingProjectTutorInput,
  PROFESSOR_ROLE_ID,
  TUTOR_ROLE_ID,
} from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import { INVITATION_COMMAND_PORT, InvitationCommandPort } from '../ports/invitation.command-port';
import { SetProjectTutorsDTO, TutorSelectionDTO } from '../dto/set-project-tutors.dto';
import { ListProjectTutorsUC } from './list-project-tutors.uc';

export interface ResolvedTutors {
  /** Users that will be linked: the chosen ones plus pending tutors whose email already has a Tutor/Professor account. */
  userIds: number[];
  /** Tutors that still need an account. */
  pendings: PendingProjectTutorInput[];
}

@Injectable()
export class SetProjectTutorsUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
    @Inject(INVITATION_COMMAND_PORT) private readonly invitations: InvitationCommandPort,
    private readonly listTutors: ListProjectTutorsUC,
  ) {}

  async execute(input: SetProjectTutorsDTO) {
    if (!input.projectId || input.projectId <= 0) throw new ValidationError('Invalid projectId');
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('Project not found');

    const resolved = await this.resolve(input);
    await this.store(input.projectId, resolved);
    if (project.state === 'APPROVED') await this.activate(input.projectId, input.eventType);
    return (await this.listTutors.execute([input.projectId])).get(input.projectId) ?? [];
  }

  /** Validates the selection without touching the project, so creation can fail before the project exists. */
  async resolve(input: TutorSelectionDTO): Promise<ResolvedTutors> {
    const requestedIds = [...new Set(input.tutorUserIds ?? [])];
    const pendings = this.dedupePendings(input.pendingTutors ?? []);
    if (requestedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new ValidationError('Invalid tutor user id');
    }

    // Candidates are Professor or Tutor users only; a missing id is unknown, inactive or without that role
    const roleIds = [PROFESSOR_ROLE_ID, TUTOR_ROLE_ID];
    if (requestedIds.length) {
      const holders = await this.auth.findUsersByRoles({ roleIds, userIds: requestedIds });
      const valid = new Set(holders.map((holder) => holder.id));
      const invalid = requestedIds.filter((id) => !valid.has(id));
      if (invalid.length) {
        throw new ValidationError(`Users ${invalid.join(', ')} are not active tutors or professors`);
      }
    }

    // A tutor typed in by email who already has an account with the right role is linked directly
    const accounts = await Promise.all(pendings.map((p) => this.auth.findUserByEmail(p.email)));
    const accountIds = accounts.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => a.id);
    const holderIds = new Set(
      accountIds.length
        ? (await this.auth.findUsersByRoles({ roleIds, userIds: accountIds })).map((h) => h.id)
        : [],
    );
    const userIds = [...requestedIds];
    const stillPending: PendingProjectTutorInput[] = [];
    pendings.forEach((pending, index) => {
      const account = accounts[index];
      if (account && holderIds.has(account.id)) {
        if (!userIds.includes(account.id)) userIds.push(account.id);
      } else {
        stillPending.push(pending);
      }
    });

    return { userIds, pendings: stillPending };
  }

  /** Stores the tutors only: no role and no invitation, because the project may still be unreviewed. */
  async store(projectId: number, resolved: ResolvedTutors): Promise<void> {
    await this.repo.replaceTutors(projectId, resolved.userIds, resolved.pendings);
  }

  /**
   * Runs once the project is approved: gives the linked tutors the Tutor role and invites the
   * pending tutors not invited before. Safe to repeat (roles are upserted, invited rows are skipped).
   * A tutor sent with an anonymous submission gets nothing until an admin approves the project.
   */
  async activate(projectId: number, eventType?: string): Promise<void> {
    for (const userId of await this.repo.listTutorUserIds(projectId)) {
      await this.auth.assignPlatformRoles(userId, [TUTOR_ROLE_ID]);
    }

    const pendings = await this.repo.listPendingTutors(projectId);
    const toInvite = pendings.filter((p) => p.status === 'PENDING');
    for (const pending of toInvite) {
      await this.invitations.createInvitation({
        email: pending.email,
        targetType: 'PROJECT_TUTOR',
        targetId: projectId,
        eventType,
        roleIds: [TUTOR_ROLE_ID],
        firstName: pending.firstName,
        lastName: pending.lastName ?? '',
      });
    }
    await this.repo.markPendingTutorsInvited(projectId, toInvite.map((p) => p.email), new Date());
  }

  private dedupePendings(pendings: PendingProjectTutorInput[]): PendingProjectTutorInput[] {
    const byEmail = new Map<string, PendingProjectTutorInput>();
    for (const pending of pendings) {
      const email = normalizeEmail(pending.email ?? '');
      if (!isEmail(email)) throw new ValidationError(`Invalid tutor email: ${pending.email}`);
      const firstName = (pending.firstName ?? '').trim();
      if (!firstName) throw new ValidationError('Tutor first name is required');
      if (!byEmail.has(email)) {
        byEmail.set(email, { firstName, lastName: pending.lastName?.trim() || null, email });
      }
    }
    return [...byEmail.values()];
  }
}
