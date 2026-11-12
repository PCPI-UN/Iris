import { PrismaService } from './prisma.service';

describe('PrismaService transaction propagation', () => {
    const fakeTx = { marker: 'tx' };

    const buildService = () => {
        const service = new PrismaService();
        const $transaction = jest
            .spyOn(service, '$transaction')
            .mockImplementation(((work: (tx: unknown) => Promise<unknown>) => work(fakeTx)) as never);
        return { service, $transaction };
    };

    it('queries through the default client, with its models, outside a transaction', () => {
        const { service } = buildService();

        expect(service.db).toBe(service);
        expect(typeof service.db.evaluation.findMany).toBe('function');
    });

    it('routes every query made inside transaction() to the open transaction, also after an await', async () => {
        const { service } = buildService();

        const seen = await service.transaction(async () => {
            await Promise.resolve();
            return service.db;
        });

        expect(seen).toBe(fakeTx);
        expect(service.db.evaluation).toBe(service.evaluation);
    });

    it('reuses the open transaction in a nested call', async () => {
        const { service, $transaction } = buildService();

        await service.transaction(() => service.transaction(async () => service.db));

        expect($transaction).toHaveBeenCalledTimes(1);
    });
});
