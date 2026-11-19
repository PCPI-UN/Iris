import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { TieBreakRepositoryPort } from '../../domain/repositories/tiebreak.repository.port';
import { TieBreak } from '../../domain/entities/tiebreak.entity';
import { CreateTieBreakDto } from '../dto/create-tiebreak.dto';

@Injectable()
export class CreateTieBreakUseCase {
    constructor(private readonly tiebreakRepository: TieBreakRepositoryPort) {}

    async execute(dto: CreateTieBreakDto): Promise<TieBreak> {
        const existing = await this.tiebreakRepository.findAll({
            projectId: dto.projectId,
            eventId: dto.eventId,
            categoryId: dto.categoryId,
        });

        if (existing.length > 0) {
            throw new RpcException({
                code: status.ALREADY_EXISTS,
                message: `Ya existe un desempate para el proyecto ${dto.projectId} en el evento ${dto.eventId} y la categoría ${dto.categoryId}`,
            });
        }

        const tiebreak = new TieBreak(
            0,
            dto.projectId,
            dto.eventId,
            dto.categoryId,
            dto.tiebreakOrder,
            new Date(),
            new Date(),
        );

        return this.tiebreakRepository.create(tiebreak);
    }
}
