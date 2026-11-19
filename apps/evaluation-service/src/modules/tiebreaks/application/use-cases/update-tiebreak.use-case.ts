import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { TieBreakRepositoryPort } from '../../domain/repositories/tiebreak.repository.port';
import { TieBreak } from '../../domain/entities/tiebreak.entity';
import { UpdateTieBreakDto } from '../dto/update-tiebreak.dto';

@Injectable()
export class UpdateTieBreakUseCase {
    constructor(private readonly tiebreakRepository: TieBreakRepositoryPort) {}

    async execute(dto: UpdateTieBreakDto): Promise<TieBreak> {
        const existing = await this.tiebreakRepository.findById(dto.id);

        if (!existing) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: `No se encontró el desempate con ID ${dto.id}`,
            });
        }

        const updated = new TieBreak(
            existing.id,
            dto.projectId ?? existing.projectId,
            existing.eventId,
            dto.categoryId ?? existing.categoryId,
            dto.tiebreakOrder ?? existing.tiebreakOrder,
            existing.createdAt,
            new Date(),
        );

        return this.tiebreakRepository.update(updated);
    }
}
