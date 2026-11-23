import { CategoryLockService } from '../../services/category-lock.service';
import { CriterionRepositoryPort } from '../../../domain/repositories/criterion.repository.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';

describe('CategoryLockService', () => {
    const buildService = (evaluatedProjectIds: number[], projectCategories: Array<[number, number]>) => {
        const repository = {
            findEvaluatedProjectIds: jest.fn().mockResolvedValue(evaluatedProjectIds),
        } as unknown as CriterionRepositoryPort;
        const projectService = {
            getProjectCategories: jest.fn().mockResolvedValue(new Map(projectCategories)),
        } as unknown as ProjectServicePort;
        return { service: new CategoryLockService(repository, projectService), projectService };
    };

    describe('findEvaluatedCategoryIds', () => {
        it('maps the evaluated projects to their categories', async () => {
            const { service } = buildService([1, 2], [[1, 10], [2, 10], [3, 20]]);

            await expect(service.findEvaluatedCategoryIds(5)).resolves.toEqual(new Set([10]));
        });

        it('ignores evaluated projects that no longer exist', async () => {
            const { service } = buildService([1, 99], [[1, 10]]);

            await expect(service.findEvaluatedCategoryIds(5)).resolves.toEqual(new Set([10]));
        });

        it('does not ask project-service when nothing was evaluated', async () => {
            const { service, projectService } = buildService([], [[1, 10]]);

            await expect(service.findEvaluatedCategoryIds(5)).resolves.toEqual(new Set());
            expect(projectService.getProjectCategories).not.toHaveBeenCalled();
        });
    });

    describe('assertNotEvaluated', () => {
        it('rejects the categories that have evaluations', async () => {
            const { service } = buildService([1], [[1, 10], [2, 20]]);

            await expect(service.assertNotEvaluated(5, [10, 20])).rejects.toEqual(
                expect.objectContaining({
                    error: expect.objectContaining({ message: expect.stringContaining('[10]') }),
                }),
            );
        });

        it('accepts the categories without evaluations', async () => {
            const { service } = buildService([1], [[1, 10], [2, 20]]);

            await expect(service.assertNotEvaluated(5, [20])).resolves.toBeUndefined();
        });

        it('does nothing when no category is affected', async () => {
            const { service, projectService } = buildService([1], [[1, 10]]);

            await expect(service.assertNotEvaluated(5, [])).resolves.toBeUndefined();
            expect(projectService.getProjectCategories).not.toHaveBeenCalled();
        });
    });
});
