import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { TieBreakRepositoryPort } from '../../domain/repositories/tiebreak.repository.port';
import { DeleteTieBreakDto } from '../dto/delete-tiebreak.dto';

@Injectable()
export class DeleteTieBreakUseCase {
    constructor(private readonly tiebreakRepository: TieBreakRepositoryPort) {}

    async execute(dto: DeleteTieBreakDto): Promise<void> {
        const existing = await this.tiebreakRepository.findById(dto.id);

        if (!existing) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: `No se encontró el desempate con ID ${dto.id}`,
            });
        }

        await this.tiebreakRepository.delete(dto.id);
    }
}
