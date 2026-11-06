import { EvaluationPrismaRepository } from '../evaluation.prisma.repository';
import { PrismaService } from '../../../../../common/prisma/prisma.service';

/**
 * Statistics consumed by the ranking and the reports (CU-86e3vmxar / IRIS-V3-EVAL-02).
 */
describe('EvaluationPrismaRepository - project statistics', () => {
    const buildRepository = (
        grades: number[],
        details: Array<{ criterionId: number; category: string | null; weight: number; score: number }> = [],
    ) => {
        const average = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
        const prisma = {
            evaluation: {
                aggregate: jest.fn().mockResolvedValue({ _avg: { grade: average }, _count: grades.length }),
                findMany: jest.fn().mockResolvedValue(grades.map((_, i) => ({ memberUserId: i + 1 }))),
                groupBy: jest.fn().mockResolvedValue(
                    grades.length ? [{ projectId: 1, _avg: { grade: average }, _count: { id: grades.length } }] : [],
                ),
            },
            evaluationDetail: {
                findMany: jest.fn().mockResolvedValue(
                    details.map((d) => ({
                        score: d.score,
                        criterion: { id: d.criterionId, category: d.category, weight: d.weight },
                    })),
                ),
            },
        };

        return new EvaluationPrismaRepository(prisma as unknown as PrismaService);
    };

    describe('getProjectStats', () => {
        it('computes the category weight as the sum of its criteria weights, even when they differ', async () => {
            // Comunicación Oral in the approved report: 0.1 + 0.09 + 0.09 = 0.28
            const repository = buildRepository([90], [
                { criterionId: 13, category: 'Comunicación Oral', weight: 0.1, score: 90 },
                { criterionId: 14, category: 'Comunicación Oral', weight: 0.09, score: 90 },
                { criterionId: 15, category: 'Comunicación Oral', weight: 0.09, score: 90 },
            ]);

            const stats = await repository.getProjectStats(1);

            expect(stats.categoryStats[0].weight).toBeCloseTo(0.28, 10);
        });

        it('counts each criterion weight once although several jurors scored it', async () => {
            const repository = buildRepository([90, 75], [
                { criterionId: 1, category: 'Comunicación Escrita', weight: 0.06, score: 90 },
                { criterionId: 2, category: 'Comunicación Escrita', weight: 0.06, score: 75 },
                { criterionId: 1, category: 'Comunicación Escrita', weight: 0.06, score: 75 },
                { criterionId: 2, category: 'Comunicación Escrita', weight: 0.06, score: 75 },
            ]);

            const stats = await repository.getProjectStats(1);

            expect(stats.categoryStats[0].weight).toBeCloseTo(0.12, 10);
            expect(stats.categoryStats[0].averageScore).toBe(78.75);
        });

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
            expect(stats.categoryStats).toEqual([]);
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
});
