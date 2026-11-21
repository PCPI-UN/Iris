import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { TermRepository } from '@events/domain/repositories/term.repository';
import { NO_TERM_ID } from '@events/domain/entities/term.entity';

/**
 * An event is created or edited only with a real term: the "no term" row is for the
 * events that existed before terms, and a missing term is rejected.
 */
export async function assertSelectableTerm(terms: TermRepository, termId: number): Promise<void> {
  if (termId === NO_TERM_ID) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Validación fallida: termId debe ser un periodo académico real',
    });
  }
  if (!(await terms.findById(termId))) {
    throw new RpcException({ code: status.NOT_FOUND, message: `No se encontró el periodo académico con ID ${termId}` });
  }
}
