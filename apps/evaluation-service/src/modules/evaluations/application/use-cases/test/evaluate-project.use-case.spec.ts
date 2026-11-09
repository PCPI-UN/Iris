import { Test, TestingModule } from '@nestjs/testing';
import { EvaluateProjectUseCase } from '../evaluate-project.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';
import { AuthServicePort } from '../../../infrastructure/ports/auth.service.port';
import { CriterionRepositoryPort } from '../../../../criterions/domain/repositories/criterion.repository.port';
import { EvaluationType } from '../../../../../common/constants/evaluation-type.constants';
import { RpcException } from '@nestjs/microservices';

describe('EvaluateProjectUseCase', () => {
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
        withRubricLock: jest.fn((_eventIds: number[], _mode: string, work: () => Promise<unknown>) => work()),
    };

    const mockAuthService = {
        getRoles: jest.fn(),
    };

    const openEvent = (evaluationType: unknown = EvaluationType.FINAL_PROJECTS) => ({
        id: 1,
        evaluationsOpened: true,
        startDate: new Date(Date.now() - 10000).toISOString(),
        endDate: new Date(Date.now() + 10000).toISOString(),
        evaluationType,
    });

    // Poster rubric: components Escrita 0.3 (5 criteria), Diseño 0.4 (7), Oral 0.3 (3), relative weight 1 each
    const posterComponents = [
        { id: 11, eventId: 1, weight: 0.3 },
        { id: 12, eventId: 1, weight: 0.4 },
        { id: 13, eventId: 1, weight: 0.3 },
    ];
    const posterRubric = [
        ...Array(5).fill(11),
        ...Array(7).fill(12),
        ...Array(3).fill(13),
    ].map((componentId, index) => ({ id: index + 1, eventId: 1, weight: 1, componentId }));

    // A single component holding the whole grade: the relative weights are the effective ones
    const withRubric = (criteria: Array<{ id: number; weight: number }>) => {
        mockCriterionRepository.findComponentsByEvent.mockResolvedValue([{ id: 1, eventId: 1, weight: 1 }]);
        mockCriterionRepository.findByCourseId.mockResolvedValue(
            criteria.map((criterion) => ({ eventId: 1, componentId: 1, ...criterion })),
        );
    };

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

        mockAuthService.getRoles.mockResolvedValue([
            { id: 1, name: 'Juror', description: 'Juror role' }
        ]);
        mockProjectService.getProject.mockResolvedValue({
            id: 1,
            eventId: 1,
            courseId: 10,
            name: 'Test Project'
        });
        mockProjectService.isJurorAssigned.mockResolvedValue(true);
        mockEventService.getEvent.mockResolvedValue(openEvent());
        mockEvaluationRepository.existsByProjectAndEvaluator.mockResolvedValue(false);
        mockEvaluationRepository.save.mockImplementation((evalObj) =>
            Promise.resolve({ ...evalObj, id: 1 })
        );
        mockCriterionRepository.findByCourseId.mockResolvedValue(posterRubric);
        mockCriterionRepository.findComponentsByEvent.mockResolvedValue(posterComponents);
    });

    it('should be defined', () => {
        expect(useCase).toBeDefined();
    });

    it('should throw RpcException if event not found', async () => {
        mockEventService.getEvent.mockResolvedValue(null);
        await expect(useCase.execute({ memberEventId: 1 } as any)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException if evaluations not opened', async () => {
        mockEventService.getEvent.mockResolvedValue({ evaluationsOpened: false });
        await expect(useCase.execute({ memberEventId: 1 } as any)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException if not assigned', async () => {
        mockProjectService.isJurorAssigned.mockResolvedValue(false);
        await expect(useCase.execute({ memberEventId: 1 } as any)).rejects.toThrow(RpcException);
    });

    it('should load the rubric from the project course', async () => {
        withRubric([{ id: 1, weight: 1 }]);

        await useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] });

        expect(mockProjectService.getProject).toHaveBeenCalledWith(1);
        expect(mockEventService.getEvent).toHaveBeenCalledWith(1);
        expect(mockCriterionRepository.findByCourseId).toHaveBeenCalledWith(10);
        expect(mockCriterionRepository.findComponentsByEvent).toHaveBeenCalledWith(1);
    });

    it('should calculate grade correctly', async () => {
        // Criterion 1: Weight 0.3, Score 4 (90) -> 27
        // Criterion 2: Weight 0.7, Score 3 (75) -> 52.5
        // Total: 79.5
        withRubric([{ id: 1, weight: 0.3 }, { id: 2, weight: 0.7 }]);

        const result = await useCase.execute({
            projectId: 1,
            userId: 1,
            comments: 'Good',
            scores: [
                { criterionId: 1, score: 4 },
                { criterionId: 2, score: 3 },
            ],
        });

        expect(result.evaluation.grade).toBe(79.5);
        expect(mockEvaluationRepository.save).toHaveBeenCalled();
    });

    it('should reject invalid FINAL_PROJECTS score with descriptive error', async () => {
        withRubric([{ id: 1, weight: 1 }]);

        await expect(
            useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 5 }] }),
        ).rejects.toThrow('Invalid score for FINAL_PROJECTS');
    });

    it('should reject UNKNOWN evaluationType with clear error', async () => {
        mockEventService.getEvent.mockResolvedValue(openEvent('UNKNOWN'));
        withRubric([{ id: 1, weight: 1 }]);

        await expect(
            useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] }),
        ).rejects.toThrow('Unsupported evaluation type: UNKNOWN');
    });

    it('should calculate grade correctly with real-world rubric data (15 criterions, 3 components)', async () => {
        const result = await useCase.execute({
            projectId: 1,
            userId: 1,
            comments: 'Real-world rubric test - Grupo 1',
            scores: [
                // Comunicación Escrita (0.06 each): [4,4,3,2,3] → 23.1
                { criterionId: 1, score: 4 },
                { criterionId: 2, score: 4 },
                { criterionId: 3, score: 3 },
                { criterionId: 4, score: 2 },
                { criterionId: 5, score: 3 },
                // Descripción del Diseño (0.4 / 7 each): [4,4,4,3,3,3,3] → 32.571428...
                { criterionId: 6, score: 4 },
                { criterionId: 7, score: 4 },
                { criterionId: 8, score: 4 },
                { criterionId: 9, score: 3 },
                { criterionId: 10, score: 3 },
                { criterionId: 11, score: 3 },
                { criterionId: 12, score: 3 },
                // Comunicación Oral (0.1 each): [4,4,3] → 25.5
                { criterionId: 13, score: 4 },
                { criterionId: 14, score: 4 },
                { criterionId: 15, score: 3 },
            ],
        });

        // 23.1 + 32.571428 + 25.5 = 81.171428 → stored rounded to 2 decimals
        expect(result.evaluation.grade).toBe(81.17);

        // Verify mapped scores stored (not original 1-4)
        expect(result.scores).toHaveLength(15);
        expect(result.scores.find(s => s.criterionId === 1)?.score).toBe(90);
        expect(result.scores.find(s => s.criterionId === 3)?.score).toBe(75);
        expect(result.scores.find(s => s.criterionId === 4)?.score).toBe(55);
    });

    it.each([
        [4, 90],
        [1, 25],
    ])('should calculate grade %p → %p when every criterion has the same level', async (level, expected) => {
        const result = await useCase.execute({
            projectId: 1,
            userId: 1,
            scores: posterRubric.map((criterion) => ({ criterionId: criterion.id, score: level })),
        });

        expect(result.evaluation.grade).toBe(expected);
    });

    it('should reject when same juror tries to evaluate same project twice', async () => {
        mockEvaluationRepository.existsByProjectAndEvaluator.mockResolvedValue(true);

        await expect(
            useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 4 }] }),
        ).rejects.toThrow(
            expect.objectContaining({
                message: expect.stringContaining('already evaluated')
            })
        );
    });

    it('should throw error when criterion is not part of the project rubric', async () => {
        withRubric([{ id: 1, weight: 1 }]);

        await expect(
            useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 999, score: 4 }] }),
        ).rejects.toThrow(
            expect.objectContaining({
                message: expect.stringContaining('Criterion 999 not found')
            })
        );
    });

    it('should handle single criterion correctly (weight = 1.0)', async () => {
        withRubric([{ id: 1, weight: 1.0 }]);

        const result = await useCase.execute({ projectId: 1, userId: 1, scores: [{ criterionId: 1, score: 3 }] });

        // Score 3 → 75, weight 1.0 → grade = 75
        expect(result.evaluation.grade).toBe(75);
    });

    it('should allow different jurors to evaluate the same project', async () => {
        withRubric([{ id: 1, weight: 0.5 }, { id: 2, weight: 0.5 }]);

        const result1 = await useCase.execute({
            projectId: 1,
            userId: 1,
            scores: [{ criterionId: 1, score: 4 }, { criterionId: 2, score: 4 }],
        });
        expect(result1.evaluation.grade).toBe(90);

        const result2 = await useCase.execute({
            projectId: 1,
            userId: 2,
            scores: [{ criterionId: 1, score: 3 }, { criterionId: 2, score: 3 }],
        });
        expect(result2.evaluation.grade).toBe(75);
        expect(mockEvaluationRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should round the grade to 2 decimals', async () => {
        // 90 * 0.4 / 7 + 75 * 0.6 = 5.142857... + 45 = 50.142857...
        withRubric([{ id: 1, weight: 0.4 / 7 }, { id: 2, weight: 0.6 + 0.4 * 6 / 7 }]);

        const result = await useCase.execute({
            projectId: 1,
            userId: 1,
            scores: [{ criterionId: 1, score: 4 }, { criterionId: 2, score: 3 }],
        });

        const raw = 90 * (0.4 / 7) + 75 * (0.6 + 0.4 * 6 / 7);
        expect(result.evaluation.grade).toBe(Math.round(raw * 100) / 100);
    });
});
