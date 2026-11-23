import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
    EvaluationRepositoryPort,
    PaginatedEvaluations,
    ProjectStats,
    EvaluationWithDetails,
    TopProject
} from '@evaluations/domain/repositories/evaluation.repository.port';
import { Evaluation } from '@evaluations/domain/entities/evaluation.entity';
import { EvaluationDetail } from '@evaluations/domain/entities/evaluation-detail.entity';
import { roundGrade } from '../../../../common/utils/grade.utils';
import { ResultEvaluation } from '../../domain/services/project-result';
import { StatsEvaluation } from '../../domain/services/criteria-stats';

@Injectable()
export class EvaluationPrismaRepository implements EvaluationRepositoryPort {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async save(evaluation: Evaluation, scores: EvaluationDetail[]): Promise<Evaluation> {
        const result = await this.prisma.db.evaluation.create({
            data: {
                projectId: evaluation.projectId,
                memberUserId: evaluation.memberUserId,
                memberEventId: evaluation.memberEventId,
                memberRoleId: evaluation.memberRoleId,
                grade: evaluation.grade,
                comments: evaluation.comments,
                date: evaluation.date,
                scores: {
                    create: scores.map(score => ({
                        criterionId: score.criterionId,
                        score: score.score,
                        weight: score.weight,
                    })),
                },
            },
            include: {
                scores: true,
            },
        });

        return new Evaluation(
            result.id,
            result.projectId,
            result.memberUserId,
            result.memberEventId,
            result.memberRoleId,
            result.grade,
            result.comments,
            result.date,
        );
    }

    async findById(id: number): Promise<Evaluation | null> {
        const result = await this.prisma.db.evaluation.findUnique({
            where: { id },
            include: {
                scores: true,
            },
        });

        if (!result) {
            return null;
        }

        return new Evaluation(
            result.id,
            result.projectId,
            result.memberUserId,
            result.memberEventId,
            result.memberRoleId,
            result.grade,
            result.comments,
            result.date,
        );
    }

    async findAll(): Promise<Evaluation[]> {
        const results = await this.prisma.db.evaluation.findMany({
            include: {
                scores: true,
            },
        });

        return results.map((result: any) => new Evaluation(
            result.id,
            result.projectId,
            result.memberUserId,
            result.memberEventId,
            result.memberRoleId,
            result.grade,
            result.comments,
            result.date,
        ));
    }

    async countAll(): Promise<number> {
        return this.prisma.db.evaluation.count();
    }

    async findByProjectId(projectId: number, page: number, limit: number): Promise<PaginatedEvaluations> {
        const skip = (page - 1) * limit;

        const [results, total] = await Promise.all([
            this.prisma.db.evaluation.findMany({
                where: { projectId },
                include: {
                    scores: true,
                },
                skip,
                take: limit,
                orderBy: { date: 'desc' },
            }),
            this.prisma.db.evaluation.count({
                where: { projectId },
            }),
        ]);

        const evaluations = results.map((result: any) => new Evaluation(
            result.id,
            result.projectId,
            result.memberUserId,
            result.memberEventId,
            result.memberRoleId,
            result.grade,
            result.comments,
            result.date
        ));

        return {
            evaluations,
            total,
        };
    }

    async findByEvaluator(userId: number, eventId: number, page: number, limit: number): Promise<PaginatedEvaluations> {
        const skip = (page - 1) * limit;

        const [results, total] = await Promise.all([
            this.prisma.db.evaluation.findMany({
                where: {
                    memberUserId: userId,
                    memberEventId: eventId,
                },
                include: {
                    scores: true,
                },
                skip,
                take: limit,
                orderBy: { date: 'desc' },
            }),
            this.prisma.db.evaluation.count({
                where: {
                    memberUserId: userId,
                    memberEventId: eventId,
                },
            }),
        ]);

        const evaluations = results.map((result: any) => new Evaluation(
            result.id,
            result.projectId,
            result.memberUserId,
            result.memberEventId,
            result.memberRoleId,
            result.grade,
            result.comments,
            result.date
        ));

        return {
            evaluations,
            total,
        };
    }

    async findByProjectAndEvaluator(projectId: number, memberUserId: number, memberEventId: number, memberRoleId: number): Promise<Evaluation | null> {
        const result = await this.prisma.db.evaluation.findFirst({
            where: {
                projectId,
                memberUserId,
                memberEventId,
                memberRoleId,
            },
            include: {
                scores: true,
            },
        });

        if (!result) {
            return null;
        }

        return new Evaluation(
            result.id,
            result.projectId,
            result.memberUserId,
            result.memberEventId,
            result.memberRoleId,
            result.grade,
            result.comments,
            result.date,
        );
    }

    async existsByProjectAndEvaluator(projectId: number, memberUserId: number, memberEventId: number): Promise<boolean> {
        const count = await this.prisma.db.evaluation.count({
            where: {
                projectId,
                memberUserId,
                memberEventId,
            },
        });

        return count > 0;
    }

    async lockProjectEvaluator(projectId: number, memberUserId: number, memberEventId: number): Promise<void> {
        // Transaction-scoped advisory lock keyed by (project, juror, event); released on commit or rollback
        const key = `evaluation:${projectId}:${memberUserId}:${memberEventId}`;
        await this.prisma.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }

    async findEvaluationDetails(evaluationId: number): Promise<EvaluationDetail[]> {
        const results = await this.prisma.db.evaluationDetail.findMany({
            where: { evaluationId },
        });

        return results.map((result: any) => new EvaluationDetail(
            result.evaluationId,
            result.criterionId,
            result.score,
            result.weight,
        ));
    }

    async findProjectEvaluationsForResult(projectId: number): Promise<ResultEvaluation[]> {
        const evaluations = await this.prisma.db.evaluation.findMany({
            where: { projectId },
            include: {
                scores: {
                    include: {
                        criterion: {
                            select: {
                                id: true,
                                name: true,
                                component: { select: { name: true } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        return evaluations.map((evaluation) => ({
            grade: evaluation.grade,
            comments: evaluation.comments,
            details: evaluation.scores.map((detail) => ({
                criterionId: detail.criterion.id,
                criterionName: detail.criterion.name,
                componentName: detail.criterion.component?.name ?? null,
                score: detail.score,
                weight: detail.weight,
            })),
        }));
    }

    async findEvaluationsForStats(projectIds: number[]): Promise<StatsEvaluation[][]> {
        const evaluations = await this.prisma.db.evaluation.findMany({
            where: { projectId: { in: projectIds } },
            select: {
                projectId: true,
                scores: {
                    select: {
                        score: true,
                        weight: true,
                        criterion: {
                            select: {
                                id: true,
                                name: true,
                                component: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
            },
        });

        const byProject = new Map<number, StatsEvaluation[]>();
        for (const evaluation of evaluations) {
            const projectEvaluations = byProject.get(evaluation.projectId) ?? [];
            projectEvaluations.push({
                details: evaluation.scores.map((detail) => ({
                    criterionId: detail.criterion.id,
                    criterionName: detail.criterion.name,
                    componentId: detail.criterion.component?.id ?? null,
                    componentName: detail.criterion.component?.name ?? null,
                    score: detail.score,
                    weight: detail.weight,
                })),
            });
            byProject.set(evaluation.projectId, projectEvaluations);
        }
        return [...byProject.values()];
    }

    async getProjectStats(projectId: number): Promise<ProjectStats> {
        // Get average grade and count
        const gradeStats = await this.prisma.db.evaluation.aggregate({
            where: { projectId },
            _avg: { grade: true },
            _count: true,
        });

        // Criteria belong to one event, so any scored criterion gives the event of the rubric used
        const scoredCriterion = await this.prisma.db.evaluationDetail.findFirst({
            where: { evaluation: { projectId } },
            select: { criterion: { select: { eventId: true } } },
        });

        // Get unique evaluator user IDs for this project
        const evaluators = await this.prisma.db.evaluation.findMany({
            where: { projectId },
            select: { memberUserId: true },
        });

        const evaluatorIds = Array.from(new Set(evaluators.map(e => e.memberUserId)));

        return {
            // Rounded here so ranking, top projects and reports compare and show the same value
            averageGrade: roundGrade(gradeStats._avg.grade || 0),
            evaluationCount: gradeStats._count,
            evaluatorIds,
            eventId: scoredCriterion?.criterion.eventId ?? null,
        };
    }

    async findByProjectIdsAndEvaluator(
        projectIds: number[],
        userId: number,
        eventId: number
    ): Promise<EvaluationWithDetails[]> {
        const evaluations = await this.prisma.db.evaluation.findMany({
            where: {
                projectId: { in: projectIds },
                memberUserId: userId,
                memberEventId: eventId,
            },
            include: {
                scores: true,
            },
        });

        return evaluations.map((evaluation: any) => ({
            evaluation: new Evaluation(
                evaluation.id,
                evaluation.projectId,
                evaluation.memberUserId,
                evaluation.memberEventId,
                evaluation.memberRoleId,
                evaluation.grade,
                evaluation.comments,
                evaluation.date
            ),
            scores: evaluation.scores.map((score: any) =>
                new EvaluationDetail(
                    evaluation.id,
                    score.criterionId,
                    score.score,
                    score.weight,
                )
            ),
        }));
    }

    async getTopProjectsByIds(projectIds: number[]): Promise<TopProject[]> {
        if (projectIds.length === 0) {
            return [];
        }

        // Find evaluations for the specified projects
        // Group by projectId and calculate average grade
        const projectGrades = await this.prisma.db.evaluation.groupBy({
            by: ['projectId'],
            where: {
                projectId: { in: projectIds },
            },
            _avg: { grade: true },
            _count: { id: true },
        });

        return projectGrades.map((pg: any) => ({
            projectId: pg.projectId,
            averageGrade: roundGrade(pg._avg.grade || 0),
            evaluationCount: pg._count.id,
        }));
    }
}
