import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
    PROJECTS_SERVICE_NAME,
    ProjectsServiceClient,
} from '@app/common/generated/project';
import { ProjectServicePort } from '../ports/project.service.port';

const PAGE_SIZE = 100;

@Injectable()
export class ProjectServiceAdapter implements ProjectServicePort, OnModuleInit {
    private projectsService: ProjectsServiceClient;

    constructor(
        @Inject(PROJECTS_SERVICE_NAME) private client: ClientGrpc,
    ) { }

    onModuleInit() {
        this.projectsService =
            this.client.getService<ProjectsServiceClient>(PROJECTS_SERVICE_NAME);
    }

    async getProjectCategories(eventId: number): Promise<Map<number, number>> {
        const categories = new Map<number, number>();
        let currentPage = 1;
        let totalPages = 1;

        do {
            const response = await lastValueFrom(
                this.projectsService.listProjectsByEvent({
                    eventId,
                    currentPage,
                    itemsPerPage: PAGE_SIZE,
                })
            );
            for (const project of response.items ?? []) {
                categories.set(project.id, project.courseId);
            }
            totalPages = response.totalPages ?? 1;
            currentPage++;
        } while (currentPage <= totalPages);

        return categories;
    }
}
