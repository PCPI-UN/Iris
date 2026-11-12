import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
    AssignEventGradingScaleRequest,
    CreateGradingScaleRequest,
    DeleteGradingScaleRequest,
    DeleteGradingScaleResponse,
    GetEventGradingScaleRequest,
    GetGradingScaleRequest,
    GRADING_SCALE_SERVICE_NAME,
    GradingScaleInput as GradingScaleInputProto,
    GradingScaleProto,
    ListGradingScalesResponse,
    UpdateGradingScaleRequest,
} from '@app/common/generated/evaluation';
import { GradingScaleInput } from '../../domain/grading-scale';
import { AssignEventGradingScaleUseCase } from '../../application/use-cases/assign-event-grading-scale.use-case';
import { CreateGradingScaleUseCase } from '../../application/use-cases/create-grading-scale.use-case';
import { DeleteGradingScaleUseCase } from '../../application/use-cases/delete-grading-scale.use-case';
import { GetEventGradingScaleUseCase } from '../../application/use-cases/get-event-grading-scale.use-case';
import { GetGradingScaleUseCase } from '../../application/use-cases/get-grading-scale.use-case';
import { GradingScaleView, ListGradingScalesUseCase } from '../../application/use-cases/list-grading-scales.use-case';
import { UpdateGradingScaleUseCase } from '../../application/use-cases/update-grading-scale.use-case';

export function toGradingScaleProto({ scale, locked }: GradingScaleView): GradingScaleProto {
    return {
        id: scale.id,
        name: scale.name,
        description: scale.description ?? undefined,
        isSystem: scale.isSystem,
        code: scale.code ?? undefined,
        createdByUserId: scale.createdByUserId ?? undefined,
        createdAt: scale.createdAt.toISOString(),
        levels: scale.levels.map(({ level, label, points }) => ({ level, label, points })),
        locked,
    };
}

function toInput(input: GradingScaleInputProto | undefined): GradingScaleInput | undefined {
    if (!input) {
        return undefined;
    }
    return { name: input.name, description: input.description, levels: input.levels ?? [] };
}

@Controller()
export class GradingScalesController {
    constructor(
        private readonly createGradingScale: CreateGradingScaleUseCase,
        private readonly listGradingScales: ListGradingScalesUseCase,
        private readonly getGradingScale: GetGradingScaleUseCase,
        private readonly updateGradingScale: UpdateGradingScaleUseCase,
        private readonly deleteGradingScale: DeleteGradingScaleUseCase,
        private readonly assignEventGradingScale: AssignEventGradingScaleUseCase,
        private readonly getEventGradingScale: GetEventGradingScaleUseCase,
    ) {}

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'CreateGradingScale')
    async create(request: CreateGradingScaleRequest): Promise<GradingScaleProto> {
        const scale = await this.createGradingScale.execute(toInput(request.scale), request.userId);
        return toGradingScaleProto({ scale, locked: false });
    }

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'ListGradingScales')
    async list(): Promise<ListGradingScalesResponse> {
        const scales = await this.listGradingScales.execute();
        return { scales: scales.map(toGradingScaleProto) };
    }

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'GetGradingScale')
    async get(request: GetGradingScaleRequest): Promise<GradingScaleProto> {
        return toGradingScaleProto(await this.getGradingScale.execute(request.id));
    }

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'UpdateGradingScale')
    async update(request: UpdateGradingScaleRequest): Promise<GradingScaleProto> {
        const scale = await this.updateGradingScale.execute(request.id, toInput(request.scale));
        return toGradingScaleProto({ scale, locked: false });
    }

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'DeleteGradingScale')
    async delete(request: DeleteGradingScaleRequest): Promise<DeleteGradingScaleResponse> {
        await this.deleteGradingScale.execute(request.id);
        return { success: true, message: 'Grading scale deleted' };
    }

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'AssignEventGradingScale')
    async assign(request: AssignEventGradingScaleRequest): Promise<GradingScaleProto> {
        const view = await this.assignEventGradingScale.execute({
            eventId: request.eventId,
            scaleId: request.scaleId,
        });
        return toGradingScaleProto(view);
    }

    @GrpcMethod(GRADING_SCALE_SERVICE_NAME, 'GetEventGradingScale')
    async getForEvent(request: GetEventGradingScaleRequest): Promise<GradingScaleProto> {
        return toGradingScaleProto(await this.getEventGradingScale.execute(request.eventId));
    }
}
