import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { CriterionRepositoryPort, PaginatedCriterions, FindAllFilters, RubricLockMode } from '@criterions/domain/repositories/criterion.repository.port';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { CriterionCourse } from '@criterions/domain/entities/criterion-courses.entity';
import { Component } from '@criterions/domain/entities/component.entity';

import { CriterionMapper } from './mappers/criterion.mapper';

// First key of the Postgres advisory locks of the rubric; the second key is the event id
const RUBRIC_LOCK_NAMESPACE = 86_301;
// Rubric changes call event-service and project-service inside the lock
const RUBRIC_LOCK_MAX_WAIT_MS = 5_000;
const RUBRIC_LOCK_TIMEOUT_MS = 15_000;

@Injectable()
export class PrismaCriterionRepository implements CriterionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  // Criterion weights are relative and never rewritten: the effective weight
  // is computed when evaluating (see domain/services/rubric.ts).
  async create(criterion: Criterion): Promise<Criterion> {
    const persistenceData = CriterionMapper.toPersistence(criterion);

    const { id, ...createData } = persistenceData;

    const newPrismaCriterion = await this.prisma.db.criterion.create({
      data: createData,
    });

    return CriterionMapper.toDomain(newPrismaCriterion);
  }

  async hasEvaluationsForEvent(eventId: number): Promise<boolean> {
    const count = await this.prisma.db.evaluation.count({
      where: { memberEventId: eventId },
    });

    return count > 0;
  }

  async withRubricLock<T>(eventIds: number[], mode: RubricLockMode, work: () => Promise<T>): Promise<T> {
    // Sorted so two calls locking the same events cannot wait for each other
    const lockedEventIds = Array.from(new Set(eventIds))
      .filter((eventId) => Number.isInteger(eventId) && eventId > 0)
      .sort((a, b) => a - b);

    return this.prisma.transaction(
      async (tx) => {
        for (const eventId of lockedEventIds) {
          if (mode === 'shared') {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${RUBRIC_LOCK_NAMESPACE}::int, ${eventId}::int)`;
          } else {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RUBRIC_LOCK_NAMESPACE}::int, ${eventId}::int)`;
          }
        }
        return work();
      },
      { maxWait: RUBRIC_LOCK_MAX_WAIT_MS, timeout: RUBRIC_LOCK_TIMEOUT_MS },
    );
  }

  async findEvaluatedProjectIds(eventId: number): Promise<number[]> {
    const evaluations = await this.prisma.db.evaluation.findMany({
      where: { memberEventId: eventId },
      select: { projectId: true },
      distinct: ['projectId'],
    });

    return evaluations.map((evaluation) => evaluation.projectId);
  }

  async countActiveCriteriaInComponent(componentId: number): Promise<number> {
    return this.prisma.db.criterion.count({
      where: { componentId, active: true },
    });
  }

  async sumComponentWeightsByEvent(eventId: number, excludeComponentId?: number): Promise<number> {
    const aggregation = await this.prisma.db.component.aggregate({
      where: {
        eventId,
        ...(excludeComponentId !== undefined && { id: { not: excludeComponentId } }),
      },
      _sum: { weight: true },
    });

    return aggregation._sum.weight ?? 0;
  }

  async findById(id: number): Promise<Criterion | null> {
    const prismaCriterion = await this.prisma.db.criterion.findUnique({
      where: { id, active: true },
    });
    
    return prismaCriterion ? CriterionMapper.toDomain(prismaCriterion) : null;
  }

  async findAll(page: number, limit: number, filters?: FindAllFilters): Promise<PaginatedCriterions> {
    let whereClause: any = {
      active: true,
    };

    if (filters?.eventId) {
      whereClause.eventId = filters.eventId;
    }

    if (filters?.courseId) {
      whereClause.criterionsCourses = {
        some: {
          courseId: filters.courseId,
        },
      };
    }

    const [results, total] = await Promise.all([
      this.prisma.db.criterion.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.criterion.count({
        where: whereClause,
      }),
    ]);

    const criterions = results.map(CriterionMapper.toDomain);

    return { criterions, total };
  }

  async update(criterion: Criterion): Promise<Criterion> {
    const persistenceData = CriterionMapper.toPersistence(criterion);

    const updatedPrismaCriterion = await this.prisma.db.criterion.update({
      where: { id: criterion.id },
      data: persistenceData,
    });

    return CriterionMapper.toDomain(updatedPrismaCriterion);
  }

  async delete(id: number): Promise<void> {
    await this.prisma.db.criterion.update({
      where: { id },
      data: { active: false },
    });
  }

  async findActiveByEventWithCourses(eventId: number): Promise<Array<{ criterion: Criterion; courseIds: number[] }>> {
    const prismaCriterions = await this.prisma.db.criterion.findMany({
      where: { eventId, active: true },
      include: { criterionsCourses: { select: { courseId: true } } },
    });

    return prismaCriterions.map(({ criterionsCourses, ...criterion }) => ({
      criterion: CriterionMapper.toDomain(criterion),
      courseIds: criterionsCourses.map((cc) => cc.courseId),
    }));
  }

  async associateCourses(criterionId: number, courseIds: number[]): Promise<void> {
    const associations = courseIds.map(courseId => ({
      criterionId,
      courseId,
    }));

    await this.prisma.db.criterionCourse.createMany({
      data: associations,
      skipDuplicates: true,
    });
  }

  async removeAllCourseAssociations(criterionId: number): Promise<void> {
    await this.prisma.db.criterionCourse.deleteMany({
      where: { criterionId },
    });
  }

  async getCriterionCourses(criterionId: number): Promise<CriterionCourse[]> {
    const prismaCriterionCourses = await this.prisma.db.criterionCourse.findMany({
      where: { criterionId },
    });

    return prismaCriterionCourses.map(CriterionMapper.criterionCourseToDomain);
  }

  async findByCourseId(courseId: number): Promise<Criterion[]> {
    const prismaCriterions = await this.prisma.db.criterion.findMany({
      where: {
        active: true,
        criterionsCourses: {
          some: {
            courseId,
          },
        },
      },
      select: {
        id: true,
        eventId: true,
        name: true,
        description: true,
        weight: true,
        active: true,
        category: true,
        componentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return prismaCriterions.map(CriterionMapper.toDomain);
  }

  async findByCourseIds(courseIds: number[]): Promise<Criterion[]> {
    const prismaCriterions = await this.prisma.db.criterion.findMany({
      where: {
        active: true,
        criterionsCourses: {
          some: {
            courseId: {
              in: courseIds,
            },
          },
        },
      },
      select: {
        id: true,
        eventId: true,
        name: true,
        description: true,
        weight: true,
        active: true,
        category: true,
        componentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return prismaCriterions.map(CriterionMapper.toDomain);
  }

  // Component methods
  async createComponent(name: string, weight: number, eventId: number): Promise<Component> {
    const prismaComponent = await this.prisma.db.component.create({
      data: {
        name,
        weight,
        eventId,
      },
    });

    return new Component(prismaComponent.id, prismaComponent.name, prismaComponent.weight, prismaComponent.eventId);
  }

  async findComponentById(id: number): Promise<Component | null> {
    const prismaComponent = await this.prisma.db.component.findUnique({
      where: { id },
    });

    if (!prismaComponent) return null;
    return new Component(prismaComponent.id, prismaComponent.name, prismaComponent.weight, prismaComponent.eventId);
  }

  async findAllComponents(): Promise<Component[]> {
    const prismaComponents = await this.prisma.db.component.findMany();
    return prismaComponents.map(
      (c) => new Component(c.id, c.name, c.weight, c.eventId)
    );
  }

  async findComponentsByEvent(eventId: number): Promise<Component[]> {
    const prismaComponents = await this.prisma.db.component.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
    });
    return prismaComponents.map(
      (c) => new Component(c.id, c.name, c.weight, c.eventId)
    );
  }

  // The event of a component never changes
  async updateComponent(component: Component): Promise<Component> {
    const prismaComponent = await this.prisma.db.component.update({
      where: { id: component.id },
      data: { name: component.name, weight: component.weight },
    });

    return new Component(prismaComponent.id, prismaComponent.name, prismaComponent.weight, prismaComponent.eventId);
  }

  async deleteComponent(id: number): Promise<void> {
    // Soft-deleted criteria keep their component reference; detach them so the FK does not block the delete.
    // Both writes run in one transaction (the rubric lock's one when there is one).
    await this.prisma.transaction(async (tx) => {
      await tx.criterion.updateMany({
        where: { componentId: id, active: false },
        data: { componentId: null },
      });
      await tx.component.delete({
        where: { id },
      });
    });
  }
}
