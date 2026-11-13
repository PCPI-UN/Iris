import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RankingEventRepository } from '@events/domain/repositories/ranking-event.repository';
import { DeleteRankingEventDTO } from '@events/application/dto/ranking-event/delete-ranking-event.dto';

@Injectable()
export class DeleteRankingEventUseCase {
  constructor(private readonly repo: RankingEventRepository) {}

  async execute(input: DeleteRankingEventDTO) {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new RpcException({
        code: 5,
        message: `No se encontró la configuración de ranking con ID ${input.id}`,
      });
    }
    await this.repo.delete(input.id);
  }
}
