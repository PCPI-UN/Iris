import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RankingEventRepository } from '@events/domain/repositories/ranking-event.repository';
import { GetRankingEventByEventIdDTO } from '@events/application/dto/ranking-event/get-ranking-event-by-event-id.dto';

@Injectable()
export class GetRankingEventByEventIdUseCase {
  constructor(private readonly repo: RankingEventRepository) {}

  async execute(input: GetRankingEventByEventIdDTO) {
    const rankingEvent = await this.repo.findByEventId(input.eventId);
    if (!rankingEvent) {
      throw new RpcException({
        code: 5,
        message: `No se encontró la configuración de ranking del evento ${input.eventId}`,
      });
    }
    return rankingEvent;
  }
}
