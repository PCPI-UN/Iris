import {
  EvaluationProto,
  FindEvaluationsByEvaluatorResponse,
  EvaluationDetailResponse,
  GetProjectStatsResponse,
  CategoryStatsResponse,
  CheckEvaluationStatusResponse,
  ProjectEvaluationStatus,
  PaginationMetadata,
  GetTopProjectsByCourseResponse,
  TopProjectProto
} from '@app/common/generated/evaluation';
import { Evaluation } from '@evaluations/domain/entities/evaluation.entity';
import { EvaluationDetail } from '@evaluations/domain/entities/evaluation-detail.entity';
import { ProjectStats, CategoryStats, ProjectEvaluationStatus as DomainProjectEvaluationStatus, TopProject } from '@evaluations/domain/repositories/evaluation.repository.port';

export class EvaluationMapper {
  static toCreateEvaluationResponse(
    result: { evaluation: Evaluation; scores: EvaluationDetail[] }
  ): EvaluationProto {
    return {
      id: result.evaluation.id,
      projectId: result.evaluation.projectId,
      userId: result.evaluation.memberUserId,
      eventId: result.evaluation.memberEventId,
      grade: result.evaluation.grade,
      comments: result.evaluation.comments || '',
      date: result.evaluation.date.toISOString(),
      scores: result.scores.map(score => this.toEvaluationDetailResponse(score)),
    };
  }

  static toFindEvaluationByIdResponse(
    result: { evaluation: Evaluation; scores: EvaluationDetailResponse[] }
  ): EvaluationProto {
    return {
      id: result.evaluation.id,
      projectId: result.evaluation.projectId,
      userId: result.evaluation.memberUserId,
      eventId: result.evaluation.memberEventId,
      grade: result.evaluation.grade,
      date: result.evaluation.date.toISOString(),
      scores: result.scores.map(score => this.toEvaluationDetailResponse(score)),
      ...(result.evaluation.comments ? { comments: result.evaluation.comments } : {})
    };
  }

  static toEvaluationResponse(
    evaluation: Evaluation
  ): EvaluationProto {
    return {
      id: evaluation.id,
      projectId: evaluation.projectId,
      userId: evaluation.memberUserId,
      eventId: evaluation.memberEventId,
      grade: evaluation.grade,
      date: evaluation.date.toISOString(),
      scores: [], // Empty for list view
      ...(evaluation.comments ? { comments: evaluation.comments } : {})

    };
  }

  static toFindEvaluationsByEvaluatorResponse(
    evaluations: Evaluation[],
    total: number,
    page: number,
    limit: number
  ): FindEvaluationsByEvaluatorResponse {

    const meta: PaginationMetadata = {
      total,
      itemsOnCurrentPage: evaluations.length,
      currentPage: page,
      itemsPerPage: limit,
      totalPages: Math.ceil(total / limit),
    };

    const formattedEvaluations: EvaluationProto[] = evaluations.map((evaluation) =>
      this.toEvaluationResponse(evaluation)
    );

    return {
      evaluations: formattedEvaluations,
      meta,
    };
  }

  static toEvaluationDetailResponse(detail: {
    evaluationId: number;
    criterionId: number;
    score: number;
    weight?: number;
  }): EvaluationDetailResponse {
    return {
      evaluationId: detail.evaluationId,
      criterionId: detail.criterionId,
      score: detail.score,
      ...(detail.weight !== undefined && { weight: detail.weight }),
    };
  }

  static toGetProjectStatsResponse(
    stats: ProjectStats,
    projectId: number,
  ): GetProjectStatsResponse {

    const categoryStats: CategoryStatsResponse[] = stats.categoryStats.map((category: CategoryStats) => ({
      category: category.category,
      averageScore: category.averageScore,
      weight: category.weight,
    }));

    return {
      projectId,
      averageGrade: stats.averageGrade,
      evaluationCount: stats.evaluationCount,
      categoryStats,
      evaluatorIds: stats.evaluatorIds || [],
    };
  }

  static toCheckEvaluationStatusResponse(
    projectStatuses: DomainProjectEvaluationStatus[]
  ): CheckEvaluationStatusResponse {
    const projects: ProjectEvaluationStatus[] = projectStatuses.map(status => {
      if (status.evaluated && status.evaluation) {
        return {
          projectId: status.projectId,
          evaluated: status.evaluated,
          evaluation: {
            id: status.evaluation.evaluation.id,
            projectId: status.evaluation.evaluation.projectId,
            userId: status.evaluation.evaluation.memberUserId,
            eventId: status.evaluation.evaluation.memberEventId,
            grade: status.evaluation.evaluation.grade,
            date: status.evaluation.evaluation.date.toISOString(),
            scores: status.evaluation.scores.map((score: EvaluationDetail) => this.toEvaluationDetailResponse(score)),
            ...(status.evaluation.evaluation.comments ? { comments: status.evaluation.evaluation.comments } : {}),
          },
        };
      } else {
        return {
          projectId: status.projectId,
          evaluated: status.evaluated,
        };
      }
    });

    return {
      projects,
    };
  }

  static toGetTopProjectsByCourseResponse(
    topProjects: TopProject[],
  ): GetTopProjectsByCourseResponse {
    return {
      topProjects: topProjects.map((tp: TopProject): TopProjectProto => ({
        projectId: tp.projectId,
        averageGrade: tp.averageGrade,
        evaluationCount: tp.evaluationCount,
      })),
    };
  }

}