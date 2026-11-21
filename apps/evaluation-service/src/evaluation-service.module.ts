import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { CriterionsModule } from './modules/criterions/criterions.module';
import { TieBreaksModule } from './modules/tiebreaks/tiebreaks.module';
import { GrpcClientsModule } from './common/grpc-clients/grpc-clients.module';
import { GradingScalesModule } from './modules/grading-scales/grading-scales.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    GrpcClientsModule,
    EvaluationsModule,
    CriterionsModule,
    TieBreaksModule,
    GradingScalesModule,
  ],
  controllers: [],
  providers: [],
})
export class EvaluationServiceModule {}
