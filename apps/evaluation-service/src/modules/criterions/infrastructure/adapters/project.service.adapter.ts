import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
    PROJECTS_SERVICE_NAME,
    ProjectsServiceClient,
} from '@app/common/generated/project';
import { MAX_LIST_PROJECTS_BY_IDS } from '@app/common/constants/projects';
import { ProjectServicePort } from '../ports/project.service.port';


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

    async getProjectCategories(projectIds: number[]): Promise<Map<number, number>> {
        const uniqueIds = [...new Set(projectIds)];
        const categories = new Map<number, number>();

        // project-service accepts a bounded number of ids per call
        for (let i = 0; i < uniqueIds.length; i += MAX_LIST_PROJECTS_BY_IDS) {
            const response = await lastValueFrom(
                this.projectsService.listProjectsByIds({
                    ids: uniqueIds.slice(i, i + MAX_LIST_PROJECTS_BY_IDS),
                })
            );
            for (const project of response.items ?? []) {
                categories.set(project.id, project.courseId);
            }
        }

        return categories;
    }
}
