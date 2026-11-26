import { AsyncLocalStorage } from 'node:async_hooks';
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly transactionStorage = new AsyncLocalStorage<Prisma.TransactionClient>();
  // PrismaClient's constructor returns a proxy that adds the model delegates (evaluation, criterion...);
  // field initializers run on that proxy, while `this` inside a getter can be the bare target.
  private readonly defaultClient: Prisma.TransactionClient = this;

  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Client for the current call: the transaction opened by `transaction()` when the call
   * runs inside one, the default client otherwise. Repositories query through it so the
   * work of a use case can run in one transaction without passing the client around.
   */
  get db(): Prisma.TransactionClient {
    return this.transactionStorage.getStore() ?? this.defaultClient;
  }

  /**
   * Runs `work` in one transaction; every query made through `db` inside it (also from
   * other repositories) uses that transaction. A nested call reuses the open transaction.
   */
  transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    const current = this.transactionStorage.getStore();
    if (current) {
      return work(current);
    }

    return this.$transaction(
      (tx) => this.transactionStorage.run(tx, () => work(tx)),
      options,
    );
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
