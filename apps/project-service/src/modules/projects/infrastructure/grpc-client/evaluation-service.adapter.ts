import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  EVALUATION_SERVICE_NAME,
  EvaluationServiceClient,
} from '@app/common/generated/evaluation';
import { EvaluationServicePort } from '../../application/ports/evaluation-service.port';

@Injectable()
export class EvaluationServiceAdapter
  implements EvaluationServicePort, OnModuleInit
{
  private svc: EvaluationServiceClient;

  constructor(
    @Inject(EVALUATION_SERVICE_NAME) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.svc = this.client.getService<EvaluationServiceClient>(
      EVALUATION_SERVICE_NAME,
    );
  }

  async countEvaluationsByProject(projectId: number): Promise<number> {
    // GetProjectStats counts every evaluation of the project (evaluationCount)
    const res = await firstValueFrom(this.svc.getProjectStats({ projectId }));
    return res?.evaluationCount ?? 0;
  }
}
