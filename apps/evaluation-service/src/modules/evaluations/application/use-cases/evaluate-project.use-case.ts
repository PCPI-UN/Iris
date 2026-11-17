import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EvaluationRepositoryPort } from '../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../infrastructure/ports/project.service.port';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';
import { AuthServicePort } from '../../infrastructure/ports/auth.service.port';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { Evaluation } from '../../domain/entities/evaluation.entity';
import { EvaluationDetail } from '../../domain/entities/evaluation-detail.entity';
import { EvaluateProjectDto } from '../dto/evaluate-project.dto';
import { ScoreMapperFactory } from '../mappers/score-mapper.factory';
import { resolveEvaluationType } from '../evaluation-type.resolver';
import { ScoreValidatorFactory } from '../validators/score-validator.factory';
import { Role } from '@app/common/generated/auth';
import { isFullWeight, roundGrade } from '../../../../common/utils/grade.utils';
import { buildRubric } from '../../../criterions/domain/services/rubric';

@Injectable()
export class EvaluateProjectUseCase {
    private readonly logger = new Logger(EvaluateProjectUseCase.name);

    constructor(
        private readonly evaluationRepository: EvaluationRepositoryPort,
        private readonly projectService: ProjectServicePort,
        private readonly eventService: EventServicePort,
        private readonly authService: AuthServicePort,
        private readonly criterionRepository: CriterionRepositoryPort,
    ) { }

    async execute(request: EvaluateProjectDto): Promise<{ evaluation: Evaluation; scores: EvaluationDetail[] }> {
        const { projectId, userId } = request;

        // 0. Get project to extract eventId
        const project = await this.projectService.getProject(projectId);
        if (!project) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: 'Project not found',
            });
        }

        const memberEventId = project.eventId;

        // 0.1 Get Juror role ID from auth service
        const roles = await this.authService.getRoles();
        const jurorRole = roles.find((role: Role) => role.name === 'Juror');
        if (!jurorRole) {
            this.logger.error('Juror role not found in the system roles');
            throw new RpcException({
                code: status.INTERNAL,
                message: 'An error ocurred while processing the evaluation',
            });
        }
        const memberRoleId = jurorRole.id;
        const memberUserId = userId;

        // 1. Validate Event
        const event = await this.eventService.getEvent(memberEventId);
        if (!event) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: 'Event not found',
            });
        }

        if (!event.evaluationsOpened) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: 'Evaluations are not opened for this event',
            });
        }

        const now = new Date();
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);

        if (now < startDate || now > endDate) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: 'Evaluations are not allowed at this time',
            });
        }

        // 2. Validate Juror Assignment
        const isAssigned = await this.projectService.isJurorAssigned(
            projectId,
            memberUserId,
        );

        if (!isAssigned) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: 'Juror is not assigned to this project',
            });
        }

        // 3-6 run in one transaction under the rubric lock of the event, so the rubric cannot change
        // between reading it and saving the evaluation. The lock is shared: evaluations do not wait for each other.
        const { savedEvaluation, evaluationDetails } = await this.criterionRepository.withRubricLock(
            [memberEventId],
            'shared',
            () => this.gradeAndSave(request, project.courseId, memberEventId, memberRoleId, event.evaluationType),
        );

        // 7. Return evaluation with scores in the expected format
        const scoresResponse: EvaluationDetail[] = evaluationDetails.map(detail => ({
            evaluationId: savedEvaluation.id,
            criterionId: detail.criterionId,
            score: detail.score,
            weight: detail.weight,
        }));

        return {
            evaluation: savedEvaluation,
            scores: scoresResponse,
        };
    }

    private async gradeAndSave(
        request: EvaluateProjectDto,
        courseId: number,
        memberEventId: number,
        memberRoleId: number,
        eventEvaluationType: unknown,
    ): Promise<{ savedEvaluation: Evaluation; evaluationDetails: EvaluationDetail[] }> {
        const { projectId, userId: memberUserId, scores, comments } = request;

        // 3. Check if already evaluated. The rubric lock is shared, so two simultaneous submissions of the
        // same juror would both pass this check: lock (project, juror) first, inside the same transaction.
        await this.evaluationRepository.lockProjectEvaluator(projectId, memberUserId, memberEventId);

        const alreadyEvaluated = await this.evaluationRepository.existsByProjectAndEvaluator(
            projectId,
            memberUserId,
            memberEventId,
        );

        if (alreadyEvaluated) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: 'Project already evaluated by this juror',
            });
        }

        // 4. Load the rubric the juror must fill: active criteria of the project's course in this event
        if (!scores || scores.length === 0) {
            throw new RpcException({
                code: status.INVALID_ARGUMENT,
                message: 'At least one score is required',
            });
        }

        const [courseCriteria, components] = await Promise.all([
            this.criterionRepository.findByCourseId(courseId),
            this.criterionRepository.findComponentsByEvent(memberEventId),
        ]);
        const rubric = courseCriteria.filter((criterion) => criterion.eventId === memberEventId);

        if (rubric.length === 0) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: 'No evaluation criteria are configured for this project',
            });
        }

        // Effective weight = component weight × relative weight ÷ Σ relative weights of the component in this course
        const { ready, componentsWeight, missingComponentIds, criteriaWithoutComponent, effectiveWeights } =
            buildRubric(components, rubric);

        if (!ready) {
            const problems: string[] = [];
            if (!isFullWeight(componentsWeight)) {
                problems.push(`component weights must add up to 100% (current: ${(componentsWeight * 100).toFixed(2)}%)`);
            }
            if (missingComponentIds.length > 0) {
                problems.push(`components without criteria for this category: ${missingComponentIds.join(', ')}`);
            }
            if (criteriaWithoutComponent.length > 0) {
                problems.push(`criteria without a component of the event: ${criteriaWithoutComponent.join(', ')}`);
            }
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: `The evaluation rubric of this project is not ready: ${problems.join('; ')}`,
            });
        }

        // 5. Calculate Grade
        let totalGrade = 0;
        const evaluationDetails: EvaluationDetail[] = [];
        const rubricById = new Map(rubric.map((criterion) => [criterion.id, criterion]));
        const scoredCriterionIds = new Set<number>();

        // Resolve score validation and mapping from the event evaluation type
        const evaluationType = resolveEvaluationType(eventEvaluationType);
        const scoreValidator = ScoreValidatorFactory.create(evaluationType);
        const scoreMapper = ScoreMapperFactory.create(evaluationType);

        for (const scoreItem of scores) {
            if (scoredCriterionIds.has(scoreItem.criterionId)) {
                throw new RpcException({
                    code: status.INVALID_ARGUMENT,
                    message: `Criterion ${scoreItem.criterionId} was scored more than once`,
                });
            }

            const criterion = rubricById.get(scoreItem.criterionId);

            if (!criterion) {
                throw new RpcException({
                    code: status.INVALID_ARGUMENT,
                    message: `Criterion ${scoreItem.criterionId} not found in the evaluation rubric of this project`,
                });
            }

            if (!Number.isInteger(scoreItem.score)) {
                throw new RpcException({
                    code: status.INVALID_ARGUMENT,
                    message: `Score for criterion ${scoreItem.criterionId} must be an integer level`,
                });
            }

            const validation = scoreValidator.validate(scoreItem.score, evaluationType);

            if (!validation.valid) {
                throw new RpcException({
                    code: status.INVALID_ARGUMENT,
                    message: validation.error,
                });
            }

            const mappedValue = scoreMapper.map(scoreItem.score, evaluationType);

            const effectiveWeight = effectiveWeights.get(criterion.id)!;
            totalGrade += mappedValue * effectiveWeight;
            scoredCriterionIds.add(scoreItem.criterionId);

            // The effective weight is stored so later rubric changes never alter how this evaluation was graded
            evaluationDetails.push(new EvaluationDetail(0, scoreItem.criterionId, mappedValue, effectiveWeight));
        }

        const missingCriterionIds = rubric
            .filter((criterion) => !scoredCriterionIds.has(criterion.id))
            .map((criterion) => criterion.id);

        if (missingCriterionIds.length > 0) {
            throw new RpcException({
                code: status.INVALID_ARGUMENT,
                message: `All criteria must be scored. Missing criteria: ${missingCriterionIds.join(', ')}`,
            });
        }

        // 6. Create Evaluation
        const evaluation = new Evaluation(
            0,
            projectId,
            memberUserId,
            memberEventId,
            memberRoleId,
            roundGrade(totalGrade),
            comments ?? null,
            new Date()
        );

        const savedEvaluation = await this.evaluationRepository.save(evaluation, evaluationDetails);

        return { savedEvaluation, evaluationDetails };
    }
}
