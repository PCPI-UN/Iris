import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import { Project } from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  categoryChangeBlocked,
  optionalText,
  ProjectBasicData,
  ProjectNameTakenError,
} from '../../domain/admin-project-edit';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import {
  EVALUATION_SERVICE_PORT,
  EvaluationServicePort,
} from '../ports/evaluation-service.port';
import { UpdateProjectUC } from './update-project.uc';

export interface AdminUpdateProjectInput {
  projectId: number;
  actingUserId: number;
  /** undefined keeps the current value */
  name?: string;
  /** undefined keeps the current value; empty or null clears it */
  description?: string | null;
  projectCode?: string | null;
  eventNumber?: string | null;
  /** A category (course) of the project's event */
  courseId?: number;
  reason?: string;
  /** Change the category even if the project has juror evaluations */
  force?: boolean;
}

const basicData = (project: Project): ProjectBasicData => ({
  name: project.name,
  description: project.description ?? null,
  projectCode: project.projectCode ?? null,
  eventNumber: project.eventNumber ?? null,
});

/**
 * Administrative edit of the basic data (name, description, code, number in the event) and
 * the category of a project; never its state. The name must be free in the event and the
 * category must belong to the project's event; changing the category of a project with juror
 * evaluations needs force. The edit is saved with its change log entries (INFO and CATEGORY,
 * only the fields that changed) in one transaction; a rejected edit leaves no entry.
 */
@Injectable()
export class AdminUpdateProjectUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly updateProject: UpdateProjectUC,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    @Inject(EVALUATION_SERVICE_PORT)
    private readonly evaluations: EvaluationServicePort,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: AdminUpdateProjectInput): Promise<Project> {
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    const before = basicData(project);
    const name = input.name === undefined ? undefined : input.name.trim();
    if (name === '') {
      throw new ValidationError('El nombre del proyecto no puede estar vacío');
    }
    const edits = {
      name,
      description: optionalText(input.description),
      projectCode: optionalText(input.projectCode),
      eventNumber: optionalText(input.eventNumber),
    };
    if (
      Object.values(edits).every((value) => value === undefined) &&
      input.courseId === undefined
    ) {
      throw new ValidationError(
        'Indica al menos un dato del proyecto para modificar',
      );
    }
    const after: ProjectBasicData = {
      name: edits.name ?? before.name,
      description:
        edits.description === undefined
          ? before.description
          : edits.description,
      projectCode:
        edits.projectCode === undefined
          ? before.projectCode
          : edits.projectCode,
      eventNumber:
        edits.eventNumber === undefined
          ? before.eventNumber
          : edits.eventNumber,
    };
    const courseId = input.courseId ?? project.courseId;

    if (after.name !== before.name) {
      const sameName = await this.repo.findByEventAndName(
        project.eventId,
        after.name,
      );
      if (sameName && sameName.id !== project.id) {
        throw new ProjectNameTakenError(after.name);
      }
    }

    if (courseId !== project.courseId) {
      await this.assertCategoryOfEvent(courseId, project.eventId);
      if (!input.force) {
        const evaluationCount =
          await this.evaluations.countEvaluationsByProject(project.id);
        if (evaluationCount > 0) throw categoryChangeBlocked(evaluationCount);
      }
    }

    const entries = [
      buildProjectChangeLogEntry({
        projectId: project.id,
        actorUserId: input.actingUserId,
        action: 'INFO',
        before: { ...before },
        after: { ...after },
        reason: input.reason,
      }),
      buildProjectChangeLogEntry({
        projectId: project.id,
        actorUserId: input.actingUserId,
        action: 'CATEGORY',
        before: { courseId: project.courseId },
        after: { courseId },
        reason: input.reason,
      }),
    ].filter((entry) => entry !== null);
    // Nothing differs from the current values: no write and no entry
    if (!entries.length) return project;

    // Only the fields that changed are written, together with their entries
    const changed = (entries.find((e) => e.action === 'INFO')?.after ??
      {}) as Partial<ProjectBasicData>;
    return this.uow.run(async () => {
      const updated = await this.updateProject.execute({
        id: project.id,
        ...changed,
        ...(courseId !== project.courseId ? { courseId } : {}),
      });
      for (const entry of entries) await this.changeLog.create(entry);
      return updated;
    });
  }

  /** The category exists, belongs to the event and is active; otherwise 400. */
  private async assertCategoryOfEvent(
    courseId: number,
    eventId: number,
  ): Promise<void> {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new ValidationError('La categoría no es válida');
    }
    const categories = await this.events.listCategoriesByEvent(eventId);
    const category = categories.find((c) => c.id === courseId);
    if (!category) {
      throw new ValidationError(
        'La categoría no pertenece al evento del proyecto',
      );
    }
    if (!category.active) {
      throw new ValidationError(
        `La categoría "${category.name}" está inactiva en el evento`,
      );
    }
  }
}
