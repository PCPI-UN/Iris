import { Test, TestingModule } from '@nestjs/testing';
import { CheckEvaluationStatusUseCase } from '../check-evaluation-status.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { Evaluation } from '../../../domain/entities/evaluation.entity';
import { EvaluationDetail } from '../../../domain/entities/evaluation-detail.entity';
import { CheckEvaluationStatusDto } from '../../dto/check-evaluation-status.dto';
import { EvaluationType as EventEvaluationType } from '@app/common/generated/event';
import { EventGradingScaleResolver } from '../../../../grading-scales/application/event-grading-scale.resolver';
import {
    buildResolver,
    customScale,
    InMemoryGradingScaleRepository,
} from '../../../../grading-scales/testing/grading-scales.fixture';

describe('CheckEvaluationStatusUseCase', () => {
    let useCase: CheckEvaluationStatusUseCase;
    let evaluationRepository: EvaluationRepositoryPort;
    let scaleRepository: InMemoryGradingScaleRepository;

    const mockEvaluationRepository = {
        findByProjectIdsAndEvaluator: jest.fn(),
    };

    const mockEventService = {
        getEvent: jest.fn(),
    };

    beforeEach(async () => {
        mockEventService.getEvent.mockResolvedValue({
            id: 1,
            evaluationType: EventEvaluationType.FINAL_PROJECTS,
        });

        scaleRepository = new InMemoryGradingScaleRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CheckEvaluationStatusUseCase,
                {
                    provide: EvaluationRepositoryPort,
                    useValue: mockEvaluationRepository,
                },
                {
                    provide: EventGradingScaleResolver,
                    useFactory: () => buildResolver(scaleRepository, mockEventService.getEvent),
                },
            ],
        }).compile();

        useCase = module.get<CheckEvaluationStatusUseCase>(CheckEvaluationStatusUseCase);
        evaluationRepository = module.get<EvaluationRepositoryPort>(EvaluationRepositoryPort);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(useCase).toBeDefined();
    });

    it('should return evaluated: false for projects without evaluations', async () => {
        const dto: CheckEvaluationStatusDto = {
            userId: 1,
            eventId: 1,
            projectIds: [1, 2, 3],
        };

        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([]);

        const result = await useCase.execute(dto);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
            projectId: 1,
            evaluated: false,
        });
        expect(result[1]).toEqual({
            projectId: 2,
            evaluated: false,
        });
        expect(result[2]).toEqual({
            projectId: 3,
            evaluated: false,
        });
    });

    it('should correctly reverse-map scores (90→4, 75→3, 55→2, 25→1)', async () => {
        const dto: CheckEvaluationStatusDto = {
            userId: 1,
            eventId: 1,
            projectIds: [1],
        };

        const evaluation = new Evaluation(1, 1, 1, 1, 1, 79.5, 'Good project', new Date());
        const scores = [
            new EvaluationDetail(1, 1, 90), // Should map to 4
            new EvaluationDetail(1, 2, 75), // Should map to 3
            new EvaluationDetail(1, 3, 55), // Should map to 2
            new EvaluationDetail(1, 4, 25), // Should map to 1
        ];

        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([
            {
                evaluation,
                scores,
            },
        ]);

        const result = await useCase.execute(dto);

        expect(result).toHaveLength(1);
        expect(result[0].evaluated).toBe(true);
        expect(result[0].evaluation).toBeDefined();
        expect(result[0].evaluation!.scores).toHaveLength(4);
        expect(result[0].evaluation!.scores[0].score).toBe(4);
        expect(result[0].evaluation!.scores[1].score).toBe(3);
        expect(result[0].evaluation!.scores[2].score).toBe(2);
        expect(result[0].evaluation!.scores[3].score).toBe(1);
    });

    it('should handle mixed evaluated and non-evaluated projects', async () => {
        const dto: CheckEvaluationStatusDto = {
            userId: 1,
            eventId: 1,
            projectIds: [1, 2, 3],
        };

        const evaluation1 = new Evaluation(1, 1, 1, 1, 1, 79.5, 'Good', new Date());
        const scores1 = [
            new EvaluationDetail(1, 1, 90),
            new EvaluationDetail(1, 2, 75),
        ];

        const evaluation3 = new Evaluation(2, 3, 1, 1, 1, 85.0, 'Excellent', new Date());
        const scores3 = [
            new EvaluationDetail(2, 1, 90),
            new EvaluationDetail(2, 2, 90),
        ];

        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([
            { evaluation: evaluation1, scores: scores1 },
            { evaluation: evaluation3, scores: scores3 },
        ]);

        const result = await useCase.execute(dto);

        expect(result).toHaveLength(3);
        
        // Project 1 - evaluated
        expect(result[0].projectId).toBe(1);
        expect(result[0].evaluated).toBe(true);
        expect(result[0].evaluation).toBeDefined();
        
        // Project 2 - not evaluated
        expect(result[1].projectId).toBe(2);
        expect(result[1].evaluated).toBe(false);
        expect(result[1].evaluation).toBeUndefined();
        
        // Project 3 - evaluated
        expect(result[2].projectId).toBe(3);
        expect(result[2].evaluated).toBe(true);
        expect(result[2].evaluation).toBeDefined();
    });

    it('should query repository with correct parameters', async () => {
        const dto: CheckEvaluationStatusDto = {
            userId: 123,
            eventId: 456,
            projectIds: [1, 2, 3, 4, 5],
        };

        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([]);

        await useCase.execute(dto);

        expect(mockEvaluationRepository.findByProjectIdsAndEvaluator).toHaveBeenCalledWith(
            [1, 2, 3, 4, 5],
            123,
            456
        );
    });

    it('should preserve evaluation metadata (grade, comments, date)', async () => {
        const dto: CheckEvaluationStatusDto = {
            userId: 1,
            eventId: 1,
            projectIds: [1],
        };

        const testDate = new Date('2024-01-15T10:30:00Z');
        const evaluation = new Evaluation(1, 1, 1, 1, 1, 82.5, 'Very good project', testDate);
        const scores = [
            new EvaluationDetail(1, 1, 90),
        ];

        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([
            { evaluation, scores },
        ]);

        const result = await useCase.execute(dto);

        expect(result[0].evaluation!.evaluation.grade).toBe(82.5);
        expect(result[0].evaluation!.evaluation.comments).toBe('Very good project');
        expect(result[0].evaluation!.evaluation.date).toEqual(testDate);
    });

    it.each([
        [EventEvaluationType.ZERO_TO_HUNDRED, [100, 80, 60, 40]],
        // 1.5 is the value ZERO_TO_FIVE stored for level 1 before it was aligned with the rubric (2)
        [EventEvaluationType.ZERO_TO_FIVE, [5, 4, 3, 1.5]],
        [EventEvaluationType.ZERO_TO_FIVE, [5, 4, 3, 2]],
    ])('reverse-maps the stored points of a %p event back to levels 4..1', async (evaluationType, stored) => {
        mockEventService.getEvent.mockResolvedValue({ id: 1, evaluationType });
        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([
            {
                evaluation: new Evaluation(1, 1, 1, 1, 1, 80, null, new Date()),
                scores: stored.map((points, index) => new EvaluationDetail(1, index + 1, points, 0.25)),
            },
        ]);

        const [status] = await useCase.execute({ userId: 1, eventId: 1, projectIds: [1] });

        expect(status.evaluation!.scores.map((score) => score.score)).toEqual([4, 3, 2, 1]);
        expect(status.evaluation!.scores.every((score) => score.weight === 0.25)).toBe(true);
    });

    it('reads the stored points back with the scale assigned to the event', async () => {
        scaleRepository.scales.set(50, customScale(50, [10, 20, 30, 40.5]));
        scaleRepository.eventScales.set(1, 50);
        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([
            {
                evaluation: new Evaluation(1, 1, 1, 1, 1, 25, null, new Date()),
                scores: [40.5, 30, 20, 10].map((points, index) => new EvaluationDetail(1, index + 1, points, 0.25)),
            },
        ]);

        const [status] = await useCase.execute({ userId: 1, eventId: 1, projectIds: [1] });

        expect(status.evaluation!.scores.map((score) => score.score)).toEqual([4, 3, 2, 1]);
        expect(mockEventService.getEvent).not.toHaveBeenCalled();
    });

    it('fails clearly when a stored score is not a value of the event scale', async () => {
        mockEvaluationRepository.findByProjectIdsAndEvaluator.mockResolvedValue([
            {
                evaluation: new Evaluation(1, 1, 1, 1, 1, 25, null, new Date()),
                scores: [new EvaluationDetail(1, 1, 33, 1)],
            },
        ]);

        await expect(useCase.execute({ userId: 1, eventId: 1, projectIds: [1] })).rejects.toThrow(
            'Stored score 33 is not a value of the grading scale "Proyectos finales"',
        );
    });
});
