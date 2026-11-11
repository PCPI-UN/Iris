import { Evaluation } from '../entities/evaluation.entity';
import { EvaluationDetail } from '../entities/evaluation-detail.entity';

export interface PaginatedEvaluations {
    evaluations: Evaluation[];
    total: number;
}

export interface CategoryStats {
    category: string;
    averageScore: number;
    weight: number;
}

export interface ProjectStats {
    averageGrade: number;
    evaluationCount: number;
    categoryStats: CategoryStats[];
    evaluatorIds?: number[];
}

export interface EvaluationWithDetails {
    evaluation: Evaluation;
    scores: EvaluationDetail[];
}

export interface ProjectEvaluationStatus {
    projectId: number;
    evaluated: boolean;
    evaluation?: EvaluationWithDetails;
}

export interface TopProject {
    projectId: number;
    averageGrade: number;
    evaluationCount: number;
}

export abstract class EvaluationRepositoryPort {
    abstract save(evaluation: Evaluation, scores: EvaluationDetail[]): Promise<Evaluation>;
    abstract findById(id: number): Promise<Evaluation | null>;
    abstract findAll(): Promise<Evaluation[]>;
    abstract findByProjectId(projectId: number, page: number, limit: number): Promise<PaginatedEvaluations>;
    abstract findByEvaluator(userId: number, eventId: number, page: number, limit: number): Promise<PaginatedEvaluations>;
    abstract findByProjectAndEvaluator(projectId: number, memberUserId: number, memberEventId: number, memberRoleId: number): Promise<Evaluation | null>;
    abstract existsByProjectAndEvaluator(projectId: number, memberUserId: number, memberEventId: number): Promise<boolean>;
    /**
     * Serializes the evaluations of one juror for one project until the current transaction ends,
     * so two simultaneous submissions cannot both pass the "already evaluated" check.
     */
    abstract lockProjectEvaluator(projectId: number, memberUserId: number, memberEventId: number): Promise<void>;
    abstract findEvaluationDetails(evaluationId: number): Promise<EvaluationDetail[]>;
    abstract getProjectStats(projectId: number): Promise<ProjectStats>;
    abstract countAll(): Promise<number>;
    abstract findByProjectIdsAndEvaluator(
        projectIds: number[],
        userId: number,
        eventId: number
    ): Promise<EvaluationWithDetails[]>;
    abstract getTopProjectsByIds(projectIds: number[]): Promise<TopProject[]>;
}