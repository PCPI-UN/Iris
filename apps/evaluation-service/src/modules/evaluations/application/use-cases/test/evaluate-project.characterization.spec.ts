import { Test, TestingModule } from '@nestjs/testing';
import { EvaluateProjectUseCase } from '../evaluate-project.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';
import { AuthServicePort } from '../../../infrastructure/ports/auth.service.port';
import { CriterionRepositoryPort } from '../../../../criterions/domain/repositories/criterion.repository.port';
import { EvaluationType } from '../../../../../common/constants/evaluation-type.constants';

/**
 * Characterization tests (CU-86e3vmxar / IRIS-V3-EVAL-02).
 *
 * These tests pin down the CURRENT behavior of the grade calculation, including
 * behavior identified as defective during the audit. They are meant to fail
 * once the corresponding fix lands; at that point the test must be rewritten to
 * assert the new expected behavior described in each "After fix" note.
 */
describe('EvaluateProjectUseCase - characterization', () => {
    let useCase: EvaluateProjectUseCase;

    const mockEvaluationRepository = {
        existsByProjectAndEvaluator: jest.fn(),
        save: jest.fn(),
    };
    const mockProjectService = {
        isJurorAssigned: jest.fn(),
        getProject: jest.fn(),
    };
    const mockEventService = {
        getEvent: jest.fn(),
    };
    const mockCriterionRepository = {
        findById: jest.fn(),
    };
    const mockAuthService = {
        getRoles: jest.fn(),
    };

    // Rubric weights exactly as they appear in Reporte_Evaluacion_Feria_Proyectos.xlsx
    // Descripción del Diseño: 7 x 0.057 = 0.399
    // Comunicación Escrita:   5 x 0.06  = 0.30
    // Comunicación Oral:      0.1 + 0.09 + 0.09 = 0.28
    // Total: 0.979
    const reportRubric: Record<number, { id: number; eventId: number; weight: number }> = {};
    [
        ...Array(7).fill(0.057),
        ...Array(5).fill(0.06),
        0.1, 0.09, 0.09,
    ].forEach((weight, index) => {
        reportRubric[index + 1] = { id: index + 1, eventId: 1, weight };
    });

    const openEvent = (evaluationType: EvaluationType) => ({
        id: 1,
        evaluationsOpened: true,
        startDate: new Date(Date.now() - 10000).toISOString(),
        endDate: new Date(Date.now() + 10000).toISOString(),
        evaluationType,
    });

    const allScores = (score: number) =>
        Object.keys(reportRubric).map((id) => ({ criterionId: Number(id), score }));

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EvaluateProjectUseCase,
                { provide: EvaluationRepositoryPort, useValue: mockEvaluationRepository },
                { provide: ProjectServicePort, useValue: mockProjectService },
                { provide: EventServicePort, useValue: mockEventService },
                { provide: AuthServicePort, useValue: mockAuthService },
                { provide: CriterionRepositoryPort, useValue: mockCriterionRepository },
            ],
        }).compile();

        useCase = module.get<EvaluateProjectUseCase>(EvaluateProjectUseCase);

        jest.clearAllMocks();

        mockAuthService.getRoles.mockResolvedValue([{ id: 1, name: 'Juror' }]);
        mockProjectService.getProject.mockResolvedValue({ id: 1, eventId: 1, courseId: 10 });
        mockProjectService.isJurorAssigned.mockResolvedValue(true);
        mockEventService.getEvent.mockResolvedValue(openEvent(EvaluationType.FINAL_PROJECTS));
        mockEvaluationRepository.existsByProjectAndEvaluator.mockResolvedValue(false);
        mockEvaluationRepository.save.mockImplementation((evaluation) =>
            Promise.resolve({ ...evaluation, id: 1 }),
        );
        mockCriterionRepository.findById.mockImplementation((id: number) =>
            Promise.resolve(reportRubric[id] ?? null),
        );
    });

    describe('weights that do not sum to 1 (finding 1)', () => {
        it('CURRENT: does not normalize, so a perfect FINAL_PROJECTS score with weights summing 0.979 yields 88.11 instead of 90', async () => {
            // After fix: depends on the business rule (reject config, or normalize to 90).
            const result = await useCase.execute({ projectId: 1, userId: 1, scores: allScores(4) });

            expect(result.evaluation.grade).toBeCloseTo(90 * 0.979, 10);
            expect(result.evaluation.grade).toBeCloseTo(88.11, 10);
        });

        it('CURRENT: a perfect ZERO_TO_FIVE score with weights summing 0.979 yields 4.895 instead of 5', async () => {
            mockEventService.getEvent.mockResolvedValue(openEvent(EvaluationType.ZERO_TO_FIVE));

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: allScores(4) });

            expect(result.evaluation.grade).toBeCloseTo(4.895, 10);
        });
    });

    describe('incomplete or inconsistent criteria (finding 2)', () => {
        it('CURRENT: accepts an evaluation that scores only a subset of the rubric, lowering the grade', async () => {
            // After fix: reject with INVALID_ARGUMENT listing the missing criteria (if all criteria are mandatory).
            const result = await useCase.execute({
                projectId: 1,
                userId: 1,
                scores: [{ criterionId: 1, score: 4 }],
            });

            expect(result.evaluation.grade).toBeCloseTo(90 * 0.057, 10);
            expect(result.scores).toHaveLength(1);
        });

        it('CURRENT: counts a duplicated criterion twice and forwards both details to the repository', async () => {
            // After fix: reject duplicates before calculating (the PK on evaluation_detail would also reject them).
            const result = await useCase.execute({
                projectId: 1,
                userId: 1,
                scores: [
                    { criterionId: 13, score: 4 },
                    { criterionId: 13, score: 4 },
                ],
            });

            expect(result.evaluation.grade).toBeCloseTo(2 * 90 * 0.1, 10);
            const [, savedDetails] = mockEvaluationRepository.save.mock.calls[0];
            expect(savedDetails.filter((d: { criterionId: number }) => d.criterionId === 13)).toHaveLength(2);
        });

        it('CURRENT: accepts a criterion that belongs to a different event than the project', async () => {
            // After fix: reject criteria whose eventId differs from the project's event.
            mockCriterionRepository.findById.mockResolvedValue({ id: 500, eventId: 99, weight: 1 });

            const result = await useCase.execute({
                projectId: 1,
                userId: 1,
                scores: [{ criterionId: 500, score: 4 }],
            });

            expect(result.evaluation.grade).toBe(90);
        });

        it('CURRENT: accepts an empty score list and stores a grade of 0', async () => {
            // After fix: reject an evaluation without scores.
            const result = await useCase.execute({ projectId: 1, userId: 1, scores: [] });

            expect(result.evaluation.grade).toBe(0);
            expect(mockEvaluationRepository.save).toHaveBeenCalled();
        });
    });

    describe('non-integer scores (finding 3)', () => {
        it.each([
            [2.6, 75],
            [3.4, 75],
            [3.5, 90],
            [0.5, 25],
        ])('CURRENT: rounds %p before validating and stores it as %p', async (rawScore, storedScore) => {
            // After fix: reject any non-integer score with INVALID_ARGUMENT.
            mockCriterionRepository.findById.mockResolvedValue({ id: 1, eventId: 1, weight: 1 });

            const result = await useCase.execute({
                projectId: 1,
                userId: 1,
                scores: [{ criterionId: 1, score: rawScore }],
            });

            expect(result.scores[0].score).toBe(storedScore);
            expect(result.evaluation.grade).toBe(storedScore);
        });
    });

    describe('grade precision', () => {
        it('CURRENT: stores the raw floating point grade without rounding', async () => {
            // After fix: depends on the agreed rounding rule (e.g. 2 decimals, as in the report).
            mockCriterionRepository.findById.mockResolvedValue({ id: 1, eventId: 1, weight: 0.057 });

            const result = await useCase.execute({
                projectId: 1,
                userId: 1,
                scores: [{ criterionId: 1, score: 2 }],
            });

            expect(result.evaluation.grade).toBe(55 * 0.057);
            expect(result.evaluation.grade).not.toBe(Number(result.evaluation.grade.toFixed(2)));
        });
    });
});
