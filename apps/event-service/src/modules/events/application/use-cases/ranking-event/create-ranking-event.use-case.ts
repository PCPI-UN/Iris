import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RankingEventRepository } from '@events/domain/repositories/ranking-event.repository';
import { CreateRankingEventDTO } from '@events/application/dto/ranking-event/create-ranking-event.dto';

@Injectable()
export class CreateRankingEventUseCase {
  constructor(private readonly repo: RankingEventRepository) {}

  async execute(input: CreateRankingEventDTO) {
    const existing = await this.repo.findByEventId(input.eventId);
    if (existing) {
      throw new RpcException({
        code: 6,
        message: `Ya existe una configuración de ranking para el evento ${input.eventId}`,
      });
    }

    return this.repo.create({
      eventId: input.eventId,
      positions: input.positions,
      visiblePublic: input.visiblePublic ?? false,
      gradeVisible: input.gradeVisible ?? false,
    });
  }
}
