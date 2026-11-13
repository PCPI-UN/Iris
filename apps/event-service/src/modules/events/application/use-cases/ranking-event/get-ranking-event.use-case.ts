import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RankingEventRepository } from '@events/domain/repositories/ranking-event.repository';
import { GetRankingEventDTO } from '@events/application/dto/ranking-event/get-ranking-event.dto';

@Injectable()
export class GetRankingEventUseCase {
  constructor(private readonly repo: RankingEventRepository) {}

  async execute(input: GetRankingEventDTO) {
    const rankingEvent = await this.repo.findById(input.id);
    if (!rankingEvent) {
      throw new RpcException({
        code: 5,
        message: `No se encontró la configuración de ranking con ID ${input.id}`,
      });
    }
    return rankingEvent;
  }
}
