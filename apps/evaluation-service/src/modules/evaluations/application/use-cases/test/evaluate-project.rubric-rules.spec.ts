import { Test, TestingModule } from '@nestjs/testing';
import { status } from '@grpc/grpc-js';
import { EvaluateProjectUseCase } from '../evaluate-project.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';
import { AuthServicePort } from '../../../infrastructure/ports/auth.service.port';
import { CriterionRepositoryPort } from '../../../../criterions/domain/repositories/criterion.repository.port';
import { EvaluationType } from '../../../../../common/constants/evaluation-type.constants';

/**
 * Rubric rules applied when a juror submits an evaluation (CU-86e3vmxar / IRIS-V3-EVAL-02):
 * - the rubric is the set of active criteria of the project's course in the project's event,
 * - the event components (weight as a fraction of the grade) must add up to 100% and each one
 *   must have at least one criterion of the course,
 * - inside a component each criterion has a relative weight:
 *   effective = componentWeight × relative ÷ Σ relative of the component in the course,
 * - every criterion must be scored exactly once with an integer level,
 * - the grade is stored rounded to 2 decimals together with each effective weight.
 */
describe('EvaluateProjectUseCase - rubric rules', () => {
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
        findByCourseId: jest.fn(),
        findComponentsByEvent: jest.fn(),
    };
    const mockAuthService = {
        getRoles: jest.fn(),
    };

    // Poster rubric (PF): Comunicación Escrita 1.5, Descripción del Diseño 2.0, Comunicación Oral 1.5 (out of 5)
    const ESCRITA = 11;
    const DISENO = 12;
    const ORAL = 13;
    const posterComponents = [
        { id: ESCRITA, eventId: 1, weight: 0.3 },
        { id: DISENO, eventId: 1, weight: 0.4 },
        { id: ORAL, eventId: 1, weight: 0.3 },
    ];
    const criterion = (id: number, componentId: number | null, weight = 1) =>
        ({ id, eventId: 1, componentId, weight });
    const posterRubric = [
        ...[1, 2, 3, 4, 5].map((id) => criterion(id, ESCRITA)),
        ...[6, 7, 8, 9, 10, 11, 12].map((id) => criterion(id, DISENO)),
        ...[13, 14, 15].map((id) => criterion(id, ORAL)),
    ];

    const openEvent = (evaluationType: EvaluationType) => ({
        id: 1,
        evaluationsOpened: true,
        startDate: new Date(Date.now() - 10000).toISOString(),
        endDate: new Date(Date.now() + 10000).toISOString(),
        evaluationType,
    });

    const scoreAll = (rubric: Array<{ id: number }>, score: number) =>
        rubric.map((c) => ({ criterionId: c.id, score }));

    const rpcError = (code: number, message: string) =>
        expect.objectContaining({
            error: expect.objectContaining({ code, message: expect.stringContaining(message) }),
        });

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
        mockCriterionRepository.findByCourseId.mockResolvedValue(posterRubric);
        mockCriterionRepository.findComponentsByEvent.mockResolvedValue(posterComponents);
    });

    describe('effective weights', () => {
        it('gives 90 to a perfect FINAL_PROJECTS evaluation with 30/40/30 components', async () => {
            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 4) });

            expect(result.evaluation.grade).toBe(90);
        });

        it('splits a component among its criteria by relative weight (Oral 10 / 9 / 9)', async () => {
            // The weights of the approved report (0.1 / 0.09 / 0.09) are valid relative weights
            const rubric = [
                ...posterRubric.slice(0, 12),
                criterion(13, ORAL, 0.1),
                criterion(14, ORAL, 0.09),
                criterion(15, ORAL, 0.09),
            ];
            mockCriterionRepository.findByCourseId.mockResolvedValue(rubric);

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(rubric, 4) });

            const [, details] = mockEvaluationRepository.save.mock.calls[0];
            const weightOf = (id: number) => details.find((d: { criterionId: number }) => d.criterionId === id).weight;
            // "Hablan con claridad": 0.3 × 10 ÷ 28 = 0.1071
            expect(weightOf(13)).toBeCloseTo(0.3 * 10 / 28, 10);
            expect(weightOf(14)).toBeCloseTo(0.3 * 9 / 28, 10);
            expect(weightOf(1)).toBeCloseTo(0.3 / 5, 10);
            expect(weightOf(6)).toBeCloseTo(0.4 / 7, 10);
            expect(result.evaluation.grade).toBe(90);
        });

        it('turns the 0.979 rubric of the approved report into a 90-point rubric once components are 30/40/30', async () => {
            const reportRubric = [
                ...[1, 2, 3, 4, 5].map((id) => criterion(id, ESCRITA, 0.06)),
                ...[6, 7, 8, 9, 10, 11, 12].map((id) => criterion(id, DISENO, 0.057)),
                criterion(13, ORAL, 0.1),
                criterion(14, ORAL, 0.09),
                criterion(15, ORAL, 0.09),
            ];
            mockCriterionRepository.findByCourseId.mockResolvedValue(reportRubric);

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(reportRubric, 4) });

            expect(result.evaluation.grade).toBe(90);
        });

        it('stores the effective weight with every detail and returns it', async () => {
            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 3) });

            const total = result.scores.reduce((sum, detail) => sum + detail.weight, 0);
            expect(total).toBeCloseTo(1, 10);
            expect(result.scores.find((detail) => detail.criterionId === 13)?.weight).toBeCloseTo(0.1, 10);
        });

        it('gives 5 to a perfect ZERO_TO_FIVE evaluation', async () => {
            mockEventService.getEvent.mockResolvedValue(openEvent(EvaluationType.ZERO_TO_FIVE));

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 4) });

            expect(result.evaluation.grade).toBe(5);
        });

        it('maps the ZERO_TO_FIVE "Insuficiente" level to 2, as in the rubric', async () => {
            mockEventService.getEvent.mockResolvedValue(openEvent(EvaluationType.ZERO_TO_FIVE));

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 1) });

            expect(result.evaluation.grade).toBe(2);
            expect(result.scores.every((detail) => detail.score === 2)).toBe(true);
        });
    });

    describe('rubric not ready', () => {
        it('rejects the evaluation when the event components do not add up to 100% (0.399 / 0.30 / 0.28)', async () => {
            mockCriterionRepository.findComponentsByEvent.mockResolvedValue([
                { id: ESCRITA, eventId: 1, weight: 0.3 },
                { id: DISENO, eventId: 1, weight: 0.399 },
                { id: ORAL, eventId: 1, weight: 0.28 },
            ]);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 4) }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'current: 97.90%'));
            expect(mockEvaluationRepository.save).not.toHaveBeenCalled();
        });

        it('rejects the evaluation when a component has no criteria in the project course', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue(posterRubric.slice(0, 12));

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric.slice(0, 12), 4) }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, `components without criteria for this category: ${ORAL}`));
        });

        it('rejects the evaluation when a criterion is not inside a component of the event', async () => {
            const rubric = [...posterRubric, criterion(16, null)];
            mockCriterionRepository.findByCourseId.mockResolvedValue(rubric);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(rubric, 4) }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'criteria without a component of the event: 16'));
        });

        it('rejects the evaluation when the project course has no criteria', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue([]);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'No evaluation criteria'));
        });

        it('ignores criteria of the same course that belong to another event', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue([
                ...posterRubric,
                { id: 99, eventId: 2, componentId: 99, weight: 1 },
            ]);

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 4) });

            expect(result.evaluation.grade).toBe(90);
        });
    });

    describe('scores sent by the juror', () => {
        it('rejects an evaluation that does not score every criterion', async () => {
            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric.slice(0, 13), 4) }),
            ).rejects.toEqual(rpcError(status.INVALID_ARGUMENT, 'Missing criteria: 14, 15'));
            expect(mockEvaluationRepository.save).not.toHaveBeenCalled();
        });

        it('rejects a criterion scored twice', async () => {
            const scores = [...scoreAll(posterRubric, 4), { criterionId: 13, score: 4 }];

            await expect(useCase.execute({ projectId: 1, userId: 1, scores })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'Criterion 13 was scored more than once'),
            );
        });

        it('rejects a criterion that is not part of the project rubric', async () => {
            const scores = [...scoreAll(posterRubric, 4), { criterionId: 500, score: 4 }];

            await expect(useCase.execute({ projectId: 1, userId: 1, scores })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'Criterion 500 not found in the evaluation rubric'),
            );
        });

        it('rejects an empty score list', async () => {
            await expect(useCase.execute({ projectId: 1, userId: 1, scores: [] })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'At least one score is required'),
            );
        });

        it.each([2.6, 3.4, 3.5, 0.5])('rejects the non-integer level %p instead of rounding it', async (rawScore) => {
            const scores = scoreAll(posterRubric, 4).map((s, i) => (i === 0 ? { ...s, score: rawScore } : s));

            await expect(useCase.execute({ projectId: 1, userId: 1, scores })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'must be an integer level'),
            );
        });
    });

    describe('grade precision', () => {
        it('stores the grade rounded to 2 decimals', async () => {
            // Escrita [4,4,3,2,3] + Diseño [4,4,4,3,3,3,3] + Oral [4,4,3] = 81.171428...
            const levels = [4, 4, 3, 2, 3, 4, 4, 4, 3, 3, 3, 3, 4, 4, 3];
            const scores = posterRubric.map((c, index) => ({ criterionId: c.id, score: levels[index] }));

            const result = await useCase.execute({ projectId: 1, userId: 1, scores });

            expect(result.evaluation.grade).toBe(81.17);
        });
    });
});
