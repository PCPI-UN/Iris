import { of } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { ProjectState } from '@app/common/generated/project';
import { EvaluationsService } from '../evaluations.service';

/**
 * The top projects of a course follow the same rules as the event ranking
 * (CU-86e3vmxar / IRIS-V3-EVAL-02): approved projects with evaluations only,
 * rounded averages, co-winners share the position and no tie-break.
 */
describe('EvaluationsService.getTopProjectsByCourse', () => {
    const buildService = (stats: Array<{ projectId: number; averageGrade: number; evaluationCount: number }>) => {
        const projectsGrpc = {
            listProjectsByEvent: jest.fn().mockReturnValue(
                of({ items: stats.map((s) => ({ id: s.projectId })) }),
            ),
            getProjectComplete: jest.fn().mockImplementation(({ id }: { id: number }) =>
                of({ items: [{ id, name: `Project ${id}`, courseId: 10, eventId: 1 }] }),
            ),
        };
        const evaluationGrpc = {
            getTopProjectsByCourse: jest.fn().mockReturnValue(of({ topProjects: stats })),
        };
        const client = (service: unknown) => ({ getService: () => service }) as unknown as ClientGrpc;

        const service = new EvaluationsService(client(evaluationGrpc), client({}), client(projectsGrpc));
        service.onModuleInit();
        return { service, projectsGrpc };
    };

    it('only asks for approved projects of the course', async () => {
        const { service, projectsGrpc } = buildService([{ projectId: 1, averageGrade: 80, evaluationCount: 3 }]);

        await service.getTopProjectsByCourse(10, 1, 5);

        expect(projectsGrpc.listProjectsByEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventId: 1, courseId: 10, state: ProjectState.APPROVED }),
        );
    });

    it('gives co-winners the same position and keeps every tied project in the cut', async () => {
        const { service } = buildService([
            { projectId: 1, averageGrade: 85.334, evaluationCount: 3 },
            { projectId: 2, averageGrade: 85.33, evaluationCount: 3 },
            { projectId: 3, averageGrade: 84.19, evaluationCount: 3 },
            { projectId: 4, averageGrade: 80, evaluationCount: 3 },
        ]);

        const result = await service.getTopProjectsByCourse(10, 1, 2);

        expect(result.items.map((p: any) => [p.id, p.position, p.averageGrade])).toEqual([
            [1, 1, 85.33],
            [2, 1, 85.33],
            [3, 2, 84.19],
        ]);
        expect(result).not.toHaveProperty('tiebreaks');
        expect(result).not.toHaveProperty('disputedProjects');
    });

    it('leaves out projects without evaluations', async () => {
        const { service } = buildService([
            { projectId: 1, averageGrade: 80, evaluationCount: 2 },
            { projectId: 2, averageGrade: 0, evaluationCount: 0 },
        ]);

        const result = await service.getTopProjectsByCourse(10, 1, 5);

        expect(result.items.map((p: any) => p.id)).toEqual([1]);
    });

    it('returns every project when the limit is 0', async () => {
        const { service } = buildService([
            { projectId: 1, averageGrade: 90, evaluationCount: 1 },
            { projectId: 2, averageGrade: 80, evaluationCount: 1 },
            { projectId: 3, averageGrade: 70, evaluationCount: 1 },
        ]);

        const result = await service.getTopProjectsByCourse(10, 1, 0);

        expect(result.items).toHaveLength(3);
    });
});
