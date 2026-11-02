import { EvaluationPrismaRepository } from '../evaluation.prisma.repository';
import { PrismaService } from '../../../../../common/prisma/prisma.service';

/**
 * Characterization tests (CU-86e3vmxar / IRIS-V3-EVAL-02) for the statistics
 * consumed by the ranking and the reports. Each test that documents a defect
 * carries an "After fix" note with the target behavior.
 */
describe('EvaluationPrismaRepository.getProjectStats - characterization', () => {
    const buildRepository = (
        grades: number[],
        details: Array<{ criterionId: number; category: string | null; weight: number; score: number }>,
    ) => {
        const prisma = {
            evaluation: {
                aggregate: jest.fn().mockResolvedValue({
                    _avg: { grade: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null },
                    _count: grades.length,
                }),
                findMany: jest.fn().mockResolvedValue(grades.map((_, i) => ({ memberUserId: i + 1 }))),
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

    it('CURRENT: computes the category weight as first criterion weight x criteria count, which is wrong for unequal weights', async () => {
        // Comunicación Oral in the approved report: 0.1 + 0.09 + 0.09 = 0.28.
        // After fix: the category weight is the sum of the distinct criteria weights (0.28).
        const repository = buildRepository([90], [
            { criterionId: 13, category: 'Comunicación Oral', weight: 0.1, score: 90 },
            { criterionId: 14, category: 'Comunicación Oral', weight: 0.09, score: 90 },
            { criterionId: 15, category: 'Comunicación Oral', weight: 0.09, score: 90 },
        ]);

        const stats = await repository.getProjectStats(1);
        const oral = stats.categoryStats.find((c) => c.category === 'Comunicación Oral');

        expect(oral?.weight).toBeCloseTo(0.3, 10);
        expect(oral?.weight).not.toBeCloseTo(0.28, 10);
    });

    it('computes the category weight correctly when all criteria in the category share the same weight', async () => {
        const repository = buildRepository([90], [
            { criterionId: 1, category: 'Comunicación Escrita', weight: 0.06, score: 90 },
            { criterionId: 2, category: 'Comunicación Escrita', weight: 0.06, score: 75 },
        ]);

        const stats = await repository.getProjectStats(1);

        expect(stats.categoryStats[0].weight).toBeCloseTo(0.12, 10);
        expect(stats.categoryStats[0].averageScore).toBeCloseTo(82.5, 10);
    });

    it('CURRENT: with an incomplete evaluation the average grade no longer equals sum(weight x criterion average)', async () => {
        // Two criteria of weight 0.5. Juror A scores both (90, 90) -> 90.
        // Juror B only scores criterion 1 (90) -> 45, because the missing criterion counts as 0.
        // averageGrade = (90 + 45) / 2 = 67.5, but sum(weight x criterion average) = 0.5 x 90 + 0.5 x 90 = 90.
        // This matches the mismatch seen in projects 4, 10, 12 and 13 of the approved report.
        // After fix: incomplete evaluations are rejected, so both figures always agree.
        const repository = buildRepository([90, 45], [
            { criterionId: 1, category: 'A', weight: 0.5, score: 90 },
            { criterionId: 2, category: 'A', weight: 0.5, score: 90 },
            { criterionId: 1, category: 'A', weight: 0.5, score: 90 },
        ]);

        const stats = await repository.getProjectStats(1);
        const weightedCriterionAverage = 0.5 * 90 + 0.5 * 90;

        expect(stats.averageGrade).toBe(67.5);
        expect(stats.averageGrade).not.toBe(weightedCriterionAverage);
        expect(stats.evaluatorIds).toEqual([1, 2]);
    });

    it('returns an average grade of 0 for a project without evaluations', async () => {
        const repository = buildRepository([], []);

        const stats = await repository.getProjectStats(1);

        expect(stats.averageGrade).toBe(0);
        expect(stats.evaluationCount).toBe(0);
        expect(stats.categoryStats).toEqual([]);
    });
});
