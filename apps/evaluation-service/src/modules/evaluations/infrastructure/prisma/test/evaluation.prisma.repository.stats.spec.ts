import { EvaluationPrismaRepository } from '../evaluation.prisma.repository';
import { PrismaService } from '../../../../../common/prisma/prisma.service';

/**
 * Statistics consumed by the ranking and the reports (CU-86e3vmxar / IRIS-V3-EVAL-02).
 */
describe('EvaluationPrismaRepository - project statistics', () => {
    const buildRepository = (grades: number[]) => {
        const average = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
        const prisma = {
            evaluation: {
                aggregate: jest.fn().mockResolvedValue({ _avg: { grade: average }, _count: grades.length }),
                findMany: jest.fn().mockResolvedValue(grades.map((_, i) => ({ memberUserId: i + 1 }))),
                groupBy: jest.fn().mockResolvedValue(
                    grades.length ? [{ projectId: 1, _avg: { grade: average }, _count: { id: grades.length } }] : [],
                ),
            },
        };

        // Repositories query through `db` (the open transaction, or the default client)
        return new EvaluationPrismaRepository({ db: prisma } as unknown as PrismaService);
    };

    describe('getProjectStats', () => {
        it('rounds the average grade to 2 decimals so ranking and report use the same value', async () => {
            // (81.171428 + 85.33) / 2 = 83.250714
            const repository = buildRepository([81.171428, 85.33]);

            const stats = await repository.getProjectStats(1);

            expect(stats.averageGrade).toBe(83.25);
            expect(stats.evaluatorIds).toEqual([1, 2]);
        });

        it('returns an average grade of 0 for a project without evaluations', async () => {
            const repository = buildRepository([]);

            const stats = await repository.getProjectStats(1);

            expect(stats.averageGrade).toBe(0);
            expect(stats.evaluationCount).toBe(0);
        });
    });

    describe('getTopProjectsByIds', () => {
        it('returns the same rounded average as getProjectStats', async () => {
            const repository = buildRepository([81.171428, 85.33]);

            const [top] = await repository.getTopProjectsByIds([1]);
            const stats = await repository.getProjectStats(1);

            expect(top.averageGrade).toBe(83.25);
            expect(top.averageGrade).toBe(stats.averageGrade);
        });
    });

    describe('findEvaluationsForStats', () => {
        it('groups the evaluations by project, with the criterion and component of each score', async () => {
            const detail = (score: number, component: { id: number; name: string } | null) => ({
                score,
                weight: 0.5,
                criterion: { id: 1, name: 'Problema', component },
            });
            const findMany = jest.fn().mockResolvedValue([
                { projectId: 1, grade: 4, scores: [detail(80, { id: 10, name: 'Fundamentación' })] },
                { projectId: 2, grade: 3.5, scores: [detail(70, null)] },
                { projectId: 1, grade: 3, scores: [detail(60, { id: 10, name: 'Fundamentación' })] },
            ]);
            const repository = new EvaluationPrismaRepository({
                db: { evaluation: { findMany } },
            } as unknown as PrismaService);

            const projects = await repository.findEvaluationsForStats([1, 2]);

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { projectId: { in: [1, 2] } } }),
            );
            expect([...projects].map(([id, evaluations]) => [id, evaluations.map((e) => [e.grade, e.details[0].score])])).toEqual([
                [1, [[4, 80], [3, 60]]],
                [2, [[3.5, 70]]],
            ]);
            expect(projects.get(1)![0].details[0]).toEqual({
                criterionId: 1,
                criterionName: 'Problema',
                componentId: 10,
                componentName: 'Fundamentación',
                score: 80,
                weight: 0.5,
            });
            expect(projects.get(2)![0].details[0]).toMatchObject({ componentId: null, componentName: null });
        });
    });
});
