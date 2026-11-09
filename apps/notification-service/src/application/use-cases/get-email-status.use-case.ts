import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EmailDelivery } from '../../domain/email-delivery';
import { EmailDeliveryRepositoryPort } from '../ports/email-delivery.repository.port';

const MAX_LOOKUPS = 100;

/** Looks deliveries up by id and/or idempotency key. */
@Injectable()
export class GetEmailStatusUseCase {
  constructor(private readonly repository: EmailDeliveryRepositoryPort) {}

  async execute(input: {
    ids?: string[];
    idempotencyKeys?: string[];
  }): Promise<EmailDelivery[]> {
    const ids = unique(input.ids);
    const keys = unique(input.idempotencyKeys);

    if (ids.length + keys.length === 0) return [];
    if (ids.length + keys.length > MAX_LOOKUPS) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `At most ${MAX_LOOKUPS} ids and keys per request`,
      });
    }

    return this.repository.findByIdsOrKeys(ids, keys);
  }
}

function unique(values: string[] = []): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
