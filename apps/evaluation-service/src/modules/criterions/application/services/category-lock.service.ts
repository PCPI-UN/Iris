import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { buildRubric } from '@criterions/domain/services/rubric';
import { ProjectServicePort } from '../../infrastructure/ports/project.service.port';

/**
 * The criteria of a category (course) cannot change once a project of that category
 * has been evaluated and while its rubric is complete. Other categories of the same event
 * can still be completed or corrected, e.g. adding the criterion an unevaluated category is missing.
 *
 * An evaluated category whose rubric is not complete (e.g. a component was added to the event,
 * or the rubric migration left it without criteria in a component) cannot be evaluated by anyone,
 * so fixing it changes no grade: each evaluation keeps the effective weights it was graded with.
 * Without this way out such a category could never be evaluated again. Once complete it locks again.
 *
 * The category of each evaluation is the category of the evaluated project, asked to
 * project-service. It cannot be deduced from the scored criteria: a criterion shared by
 * two categories would mark both as evaluated.
 */
@Injectable()
export class CategoryLockService {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly projectService: ProjectServicePort,
  ) { }

  /**
   * Rejects a change of the rubric of the given categories of an event when any of them
   * already has evaluations and a complete rubric.
   */
  async assertNotEvaluated(eventId: number, categoryIds: Iterable<number>): Promise<void> {
    const affected = Array.from(new Set(categoryIds));
    if (affected.length === 0) return;

    const evaluatedProjectIds = await this.criterionRepository.findEvaluatedProjectIds(eventId);
    if (evaluatedProjectIds.length === 0) return;

    const projectCategories = await this.projectService.getProjectCategories(eventId);
    const evaluatedCategories = new Set<number>();
    for (const projectId of evaluatedProjectIds) {
      const categoryId = projectCategories.get(projectId);
      if (categoryId === undefined) {
        // The category of an evaluated project is unknown (e.g. the project was deleted):
        // any category could be the evaluated one, so none can change.
        throw new RpcException({
          code: status.FAILED_PRECONDITION,
          message: `Event ${eventId} has evaluations of project ${projectId}, whose category is unknown; its criteria cannot be modified`,
        });
      }
      evaluatedCategories.add(categoryId);
    }

    const evaluated = affected.filter((categoryId) => evaluatedCategories.has(categoryId));
    if (evaluated.length === 0) return;

    const locked = await this.withCompleteRubric(eventId, evaluated);
    if (locked.length > 0) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `Categories [${locked.join(', ')}] of event ${eventId} already have evaluations and a complete rubric; their criteria cannot be modified`,
      });
    }
  }

  /** The given categories whose rubric is complete (they can be evaluated as they are now). */
  private async withCompleteRubric(eventId: number, categoryIds: number[]): Promise<number[]> {
    const [components, criteriaWithCourses] = await Promise.all([
      this.criterionRepository.findComponentsByEvent(eventId),
      this.criterionRepository.findActiveByEventWithCourses(eventId),
    ]);

    return categoryIds.filter((categoryId) => {
      const criteria = criteriaWithCourses
        .filter(({ courseIds }) => courseIds.includes(categoryId))
        .map(({ criterion }) => criterion);
      return buildRubric(components, criteria).ready;
    });
  }
}
