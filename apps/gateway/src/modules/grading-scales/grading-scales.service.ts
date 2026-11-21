import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  GRADING_SCALE_SERVICE_NAME,
  GradingScaleProto,
  GradingScaleServiceClient,
} from '@app/common/generated/evaluation';
import { GradingScaleDto } from './dto/grading-scale.dto';

@Injectable()
export class GradingScalesService implements OnModuleInit {
  private gradingScales!: GradingScaleServiceClient;

  constructor(@Inject(GRADING_SCALE_SERVICE_NAME) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.gradingScales = this.client.getService<GradingScaleServiceClient>(GRADING_SCALE_SERVICE_NAME);
  }

  async list(): Promise<GradingScaleProto[]> {
    const response = await firstValueFrom(this.gradingScales.listGradingScales({}));
    return response.scales ?? [];
  }

  get(id: number): Promise<GradingScaleProto> {
    return firstValueFrom(this.gradingScales.getGradingScale({ id }));
  }

  create(scale: GradingScaleDto, userId?: number): Promise<GradingScaleProto> {
    return firstValueFrom(this.gradingScales.createGradingScale({ scale, userId }));
  }

  update(id: number, scale: GradingScaleDto): Promise<GradingScaleProto> {
    return firstValueFrom(this.gradingScales.updateGradingScale({ id, scale }));
  }

  delete(id: number) {
    return firstValueFrom(this.gradingScales.deleteGradingScale({ id }));
  }
}
