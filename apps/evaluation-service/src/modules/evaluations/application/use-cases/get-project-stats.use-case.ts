import { EvaluationRepositoryPort, ProjectStats } from "../../domain/repositories/evaluation.repository.port";
import { GetProjectStatsDto } from "../dto/get-project-stats.dto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class GetProjectStatsUseCase {
    constructor(
        private readonly evaluationRepository: EvaluationRepositoryPort,
    ) {}

    async execute(dto: GetProjectStatsDto): Promise<ProjectStats> {
        return this.evaluationRepository.getProjectStats(dto.projectId);
    }
}
