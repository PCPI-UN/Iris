import { Injectable, Inject } from "@nestjs/common";
import { EvaluationRepositoryPort } from "@evaluations/domain/repositories/evaluation.repository.port";
import { Evaluation } from "@evaluations/domain/entities/evaluation.entity";
import { EvaluationDetail } from "@evaluations/domain/entities/evaluation-detail.entity";
import { RpcException } from "@nestjs/microservices";

@Injectable()
export class FindByIdUseCase {
    constructor(
        private readonly evaluationRepository: EvaluationRepositoryPort,
    ) {}

    async execute(id: number): Promise<{
        evaluation: Evaluation;
        scores: EvaluationDetail[];
    } | null> {

        const evaluation = await this.evaluationRepository.findById(id);
        if (!evaluation) {
            throw new RpcException({
                code: 5, // 5 = NOT_FOUND in gRPC
                message: 'No se encontró la evaluación',
            });
        }

        const scores = await this.evaluationRepository.findEvaluationDetails(evaluation.id);

        return { evaluation, scores };
    }
}