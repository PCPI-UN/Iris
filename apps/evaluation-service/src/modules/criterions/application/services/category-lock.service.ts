import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { ProjectServicePort } from '../../infrastructure/ports/project.service.port';

/**
 * The criteria of a category (course) cannot change once a project of that category
 * has been evaluated: the remaining jurors would grade with a different rubric than the
 * ones who already evaluated, and historical grades are never recalculated. Other
 * categories of the same event can still be completed or corrected, e.g. adding the
 * criterion an unevaluated category is missing.
 *
 * The category of each evaluation is the category of the evaluated project, asked to
 * project-service. It cannot be deduced from the scored criteria: a criterion shared by
 * two categories would mark both as evaluated. Evaluations of projects that no longer
 * exist (deleted projects) are ignored: they are not part of any ranking anymore.
 */
@Injectable()
export class CategoryLockService {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly projectService: ProjectServicePort,
  ) { }

  /**
   * Rejects a change of the rubric of the given categories of an event when any of them
   * already has evaluations.
   */
  async assertNotEvaluated(eventId: number, categoryIds: Iterable<number>): Promise<void> {
    const affected = Array.from(new Set(categoryIds));
    if (affected.length === 0) return;

    const evaluatedProjectIds = await this.criterionRepository.findEvaluatedProjectIds(eventId);
    if (evaluatedProjectIds.length === 0) return;

    // Every project of the event (all pages): a missing one was deleted
    const projectCategories = await this.projectService.getProjectCategories(eventId);
    const evaluatedCategories = new Set(
      evaluatedProjectIds
        .map((projectId) => projectCategories.get(projectId))
        .filter((categoryId): categoryId is number => categoryId !== undefined),
    );

    const locked = affected.filter((categoryId) => evaluatedCategories.has(categoryId));
    if (locked.length > 0) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `Categories [${locked.join(', ')}] of event ${eventId} already have evaluations; their criteria cannot be modified`,
      });
    }
  }
}
