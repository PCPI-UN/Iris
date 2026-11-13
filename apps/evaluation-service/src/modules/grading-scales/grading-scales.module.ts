import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CriterionsModule } from '../criterions/criterions.module';
import { GradingScaleRepositoryPort } from './domain/grading-scale.repository.port';
import { PrismaGradingScaleRepository } from './infrastructure/prisma-grading-scale.repository';
import { EventDirectoryPort, GrpcEventDirectory } from './infrastructure/event-directory';
import { EventGradingScaleResolver } from './application/event-grading-scale.resolver';
import { GradingScaleBackfillService } from './application/grading-scale-backfill.service';
import { CreateGradingScaleUseCase } from './application/use-cases/create-grading-scale.use-case';
import { ListGradingScalesUseCase } from './application/use-cases/list-grading-scales.use-case';
import { GetGradingScaleUseCase } from './application/use-cases/get-grading-scale.use-case';
import { UpdateGradingScaleUseCase } from './application/use-cases/update-grading-scale.use-case';
import { DeleteGradingScaleUseCase } from './application/use-cases/delete-grading-scale.use-case';
import { AssignEventGradingScaleUseCase } from './application/use-cases/assign-event-grading-scale.use-case';
import { GetEventGradingScaleUseCase } from './application/use-cases/get-event-grading-scale.use-case';
import { UnassignEventGradingScaleUseCase } from './application/use-cases/unassign-event-grading-scale.use-case';
import { GradingScalesController } from './interface/grpc/grading-scales.controller';

@Module({
    imports: [PrismaModule, CriterionsModule],
    controllers: [GradingScalesController],
    providers: [
        { provide: GradingScaleRepositoryPort, useClass: PrismaGradingScaleRepository },
        { provide: EventDirectoryPort, useClass: GrpcEventDirectory },
        EventGradingScaleResolver,
        GradingScaleBackfillService,
        CreateGradingScaleUseCase,
        ListGradingScalesUseCase,
        GetGradingScaleUseCase,
        UpdateGradingScaleUseCase,
        DeleteGradingScaleUseCase,
        AssignEventGradingScaleUseCase,
        GetEventGradingScaleUseCase,
        UnassignEventGradingScaleUseCase,
    ],
    exports: [EventGradingScaleResolver],
})
export class GradingScalesModule {}
