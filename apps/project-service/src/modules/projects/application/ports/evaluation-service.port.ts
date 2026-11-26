export const EVALUATION_SERVICE_PORT = 'EVALUATION_SERVICE_PORT';

export interface EvaluationServicePort {
  /** Number of juror evaluations stored for the project (0 when it has none). */
  countEvaluationsByProject(projectId: number): Promise<number>;
}
