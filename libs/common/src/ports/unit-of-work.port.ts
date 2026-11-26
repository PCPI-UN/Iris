/**
 * Runs `work` in one transaction of the service's database: every repository write inside it
 * is saved together or not at all. See docs/transactions.md.
 * - Await everything started inside `work`: a promise left running keeps the transaction and fails once it closes.
 * - Calls to other services go before or after `run`: the transaction closes after Prisma's default 5 s.
 * - Do not catch a database error and continue inside `work`: the transaction is already aborted.
 */
export abstract class UnitOfWork {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
