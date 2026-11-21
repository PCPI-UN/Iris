import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { TieBreakRepositoryPort } from '../../domain/repositories/tiebreak.repository.port';
import { TieBreak } from '../../domain/entities/tiebreak.entity';
import { GetTieBreakDto } from '../dto/get-tiebreak.dto';

@Injectable()
export class GetTieBreakUseCase {
    constructor(private readonly tiebreakRepository: TieBreakRepositoryPort) {}

    async execute(dto: GetTieBreakDto): Promise<TieBreak> {
        const tiebreak = await this.tiebreakRepository.findById(dto.id);

        if (!tiebreak) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: `No se encontró el desempate con ID ${dto.id}`,
            });
        }

        return tiebreak;
    }
}
