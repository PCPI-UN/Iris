import { Evaluation } from '../entities/evaluation.entity';
import { EvaluationDetail } from '../entities/evaluation-detail.entity';
import { ResultEvaluation } from '../services/project-result';
import { StatsEvaluation } from '../services/criteria-stats';

export interface PaginatedEvaluations {
    evaluations: Evaluation[];
    total: number;
}

export interface ProjectStats {
    averageGrade: number;
    evaluationCount: number;
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
    /** Every evaluation of the project with its scores, criteria and components, oldest first */
    abstract findProjectEvaluationsForResult(projectId: number): Promise<ResultEvaluation[]>;
    /** The evaluations of each project that has any, by project id, with the grade and each score's criterion and component */
    abstract findEvaluationsForStats(projectIds: number[]): Promise<Map<number, StatsEvaluation[]>>;
    abstract countAll(): Promise<number>;
    abstract findByProjectIdsAndEvaluator(
        projectIds: number[],
        userId: number,
        eventId: number
    ): Promise<EvaluationWithDetails[]>;
    abstract getTopProjectsByIds(projectIds: number[]): Promise<TopProject[]>;
}