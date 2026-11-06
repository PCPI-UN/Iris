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
 * - its weights must add up to 100%,
 * - every criterion must be scored exactly once with an integer level,
 * - the grade is stored rounded to 2 decimals.
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
    };
    const mockAuthService = {
        getRoles: jest.fn(),
    };

    // Poster rubric (PF): Comunicación Escrita 1.5, Descripción del Diseño 2.0, Comunicación Oral 1.5 (out of 5)
    const posterRubric = [
        ...Array(5).fill(0.3 / 5),
        ...Array(7).fill(0.4 / 7),
        ...Array(3).fill(0.3 / 3),
    ].map((weight, index) => ({ id: index + 1, eventId: 1, weight }));

    // Weights exactly as configured in the event behind Reporte_Evaluacion_Feria_Proyectos.xlsx (total 0.979)
    const misconfiguredRubric = [
        ...Array(7).fill(0.057),
        ...Array(5).fill(0.06),
        0.1, 0.09, 0.09,
    ].map((weight, index) => ({ id: index + 1, eventId: 1, weight }));

    const openEvent = (evaluationType: EvaluationType) => ({
        id: 1,
        evaluationsOpened: true,
        startDate: new Date(Date.now() - 10000).toISOString(),
        endDate: new Date(Date.now() + 10000).toISOString(),
        evaluationType,
    });

    const scoreAll = (rubric: Array<{ id: number }>, score: number) =>
        rubric.map((criterion) => ({ criterionId: criterion.id, score }));

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
    });

    describe('rubric weights', () => {
        it('gives 90 to a perfect FINAL_PROJECTS evaluation when the weights come from 30/40/30 components', async () => {
            const result = await useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(posterRubric, 4) });

            expect(result.evaluation.grade).toBe(90);
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

        it('rejects the evaluation when the rubric weights do not add up to 100% (e.g. 0.979)', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue(misconfiguredRubric);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: scoreAll(misconfiguredRubric, 4) }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'current: 97.90%'));
            expect(mockEvaluationRepository.save).not.toHaveBeenCalled();
        });

        it('rejects the evaluation when the project course has no criteria', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue([]);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'No evaluation criteria'));
        });

        it('ignores criteria of the same course that belong to another event', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue([
                { id: 1, eventId: 1, weight: 1 },
                { id: 2, eventId: 99, weight: 1 },
            ]);

            const result = await useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] });

            expect(result.evaluation.grade).toBe(90);
        });
    });

    describe('scores sent by the juror', () => {
        it('rejects an evaluation that does not score every criterion', async () => {
            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] }),
            ).rejects.toEqual(rpcError(status.INVALID_ARGUMENT, 'Missing criteria: 2, 3'));
            expect(mockEvaluationRepository.save).not.toHaveBeenCalled();
        });

        it('rejects a criterion scored twice', async () => {
            const scores = [...scoreAll(posterRubric, 4), { criterionId: 13, score: 4 }];

            await expect(useCase.execute({ projectId: 1, userId: 1, scores })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'Criterion 13 was scored more than once'),
            );
        });

        it('rejects a criterion that belongs to another event', async () => {
            mockCriterionRepository.findByCourseId.mockResolvedValue([{ id: 500, eventId: 99, weight: 1 }]);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 500, score: 4 }] }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'No evaluation criteria'));
        });

        it('rejects an empty score list', async () => {
            await expect(useCase.execute({ projectId: 1, userId: 1, scores: [] })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'At least one score is required'),
            );
        });

        it.each([2.6, 3.4, 3.5, 0.5])('rejects the non-integer level %p instead of rounding it', async (rawScore) => {
            mockCriterionRepository.findByCourseId.mockResolvedValue([{ id: 1, eventId: 1, weight: 1 }]);

            await expect(
                useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: rawScore }] }),
            ).rejects.toEqual(rpcError(status.INVALID_ARGUMENT, 'must be an integer level'));
        });
    });

    describe('grade precision', () => {
        it('stores the grade rounded to 2 decimals', async () => {
            // Escrita [4,4,3,2,3] + Diseño [4,4,4,3,3,3,3] + Oral [4,4,3] = 81.171428...
            const levels = [4, 4, 3, 2, 3, 4, 4, 4, 3, 3, 3, 3, 4, 4, 3];
            const scores = posterRubric.map((criterion, index) => ({ criterionId: criterion.id, score: levels[index] }));

            const result = await useCase.execute({ projectId: 1, userId: 1, scores });

            expect(result.evaluation.grade).toBe(81.17);
        });
    });
});
