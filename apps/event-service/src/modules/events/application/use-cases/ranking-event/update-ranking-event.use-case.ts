import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RankingEventRepository } from '@events/domain/repositories/ranking-event.repository';
import { UpdateRankingEventDTO } from '@events/application/dto/ranking-event/update-ranking-event.dto';

@Injectable()
export class UpdateRankingEventUseCase {
  constructor(private readonly repo: RankingEventRepository) {}

  async execute(input: UpdateRankingEventDTO) {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new RpcException({
        code: 5,
        message: `No se encontró la configuración de ranking con ID ${input.id}`,
      });
    }

    return this.repo.update(input.id, {
      positions: input.positions,
      visiblePublic: input.visiblePublic,
      gradeVisible: input.gradeVisible,
    });
  }
}
