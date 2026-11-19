import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EvaluateProjectUseCase } from '@evaluations/application/use-cases/evaluate-project.use-case';
import { FindByIdUseCase } from '@evaluations/application/use-cases/find-evaluation.use-case';
import { FindEvaluationsByProjectUseCase } from '@evaluations/application/use-cases/find-evaluations-by-project.use-case';
import { FindEvaluationsByEvaluatorUseCase } from '@evaluations/application/use-cases/find-evaluations-by-evaluator.use-case';
import { GetProjectStatsUseCase } from '@evaluations/application/use-cases/get-project-stats.use-case';
import { GetProjectResultUseCase } from '@evaluations/application/use-cases/get-project-result.use-case';
import { GetProjectResultDto } from '@evaluations/application/dto/get-project-result.dto';
import { CheckEvaluationStatusUseCase } from '@evaluations/application/use-cases/check-evaluation-status.use-case';
import { GetTopProjectsByCourseUseCase } from '@evaluations/application/use-cases/get-top-projects-by-course.use-case';
import { EvaluateProjectDto } from '@evaluations/application/dto/evaluate-project.dto';
import { FindEvaluationDto } from '@evaluations/application/dto/find-evaluation.dto';
import { FindEvaluationsByEvaluatorDto } from '@evaluations/application/dto/find-evaluations-by-evaluator.dto';
import { GetProjectStatsDto } from '@evaluations/application/dto/get-project-stats.dto';
import { CheckEvaluationStatusDto } from '@evaluations/application/dto/check-evaluation-status.dto';
import { GetTopProjectsByCourseDto } from '@evaluations/application/dto/get-top-projects-by-course.dto';
import { GetDashboardStatsUC } from '../../application/use-cases/get-dashboard-stats.use-case';
import {
    EVALUATION_SERVICE_NAME,
    EvaluationProto,
    FindEvaluationsByEvaluatorResponse,
    GetProjectStatsResponse,
    GetProjectResultResponse,
    CheckEvaluationStatusResponse,
    GetTopProjectsByCourseRequest,
    GetTopProjectsByCourseResponse,
} from '@app/common/generated/evaluation';
import { EvaluationMapper } from '@evaluations/application/mappers/evaluation.mapper';

@Controller()
export class EvaluationsController {
    constructor(
        private readonly evaluateProjectUseCase: EvaluateProjectUseCase,
        private readonly findByIdUseCase: FindByIdUseCase,
        private readonly findEvaluationsByEvaluatorUseCase: FindEvaluationsByEvaluatorUseCase,
        private readonly getProjectStatsUseCase: GetProjectStatsUseCase,
        private readonly checkEvaluationStatusUseCase: CheckEvaluationStatusUseCase,
        private readonly getTopProjectsByCourseUseCase: GetTopProjectsByCourseUseCase,
        private readonly getDashboardStatsUC: GetDashboardStatsUC,
        private readonly getProjectResultUseCase: GetProjectResultUseCase,
    ) { }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'EvaluateProject')
    async evaluateProject(request: EvaluateProjectDto): Promise<EvaluationProto> {
        const result = await this.evaluateProjectUseCase.execute(request);
        return EvaluationMapper.toCreateEvaluationResponse(result);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'FindEvaluationById')
    async findEvaluationById(request: FindEvaluationDto): Promise<EvaluationProto | null> {
        const result = await this.findByIdUseCase.execute(request.id);

        if (!result) {
            return null;
        }

        return EvaluationMapper.toFindEvaluationByIdResponse(result);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'FindEvaluationsByEvaluator')
    async findEvaluationsByEvaluator(request: FindEvaluationsByEvaluatorDto): Promise<FindEvaluationsByEvaluatorResponse> {
        const { evaluations, total } = await this.findEvaluationsByEvaluatorUseCase.execute(request);

        const page = request.page ?? 1;
        const limit = request.limit ?? 10;

        return EvaluationMapper.toFindEvaluationsByEvaluatorResponse(evaluations, total, page, limit);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'GetProjectStats')
    async getProjectStats(request: GetProjectStatsDto): Promise<GetProjectStatsResponse> {
        const stats = await this.getProjectStatsUseCase.execute(request);
        return EvaluationMapper.toGetProjectStatsResponse(stats, request.projectId);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'GetProjectResult')
    async getProjectResult(request: GetProjectResultDto): Promise<GetProjectResultResponse> {
        const result = await this.getProjectResultUseCase.execute(request);
        return EvaluationMapper.toGetProjectResultResponse(result);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'CheckEvaluationStatus')
    async checkEvaluationStatus(request: CheckEvaluationStatusDto): Promise<CheckEvaluationStatusResponse> {
        const result = await this.checkEvaluationStatusUseCase.execute(request);
        return EvaluationMapper.toCheckEvaluationStatusResponse(result);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'GetTopProjectsByCourse')
    async getTopProjectsByCourse(request: GetTopProjectsByCourseRequest): Promise<GetTopProjectsByCourseResponse> {
        const dto = new GetTopProjectsByCourseDto();
        dto.projectIds = request.projectIds;

        const topProjects = await this.getTopProjectsByCourseUseCase.execute(dto);

        return EvaluationMapper.toGetTopProjectsByCourseResponse(topProjects);
    }

    @GrpcMethod(EVALUATION_SERVICE_NAME, 'GetDashboardStats')
    async getDashboardStats() {
        return this.getDashboardStatsUC.execute();
    }

}
