import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  ProjectsServiceClient,
  Project,
  AddParticipantResponse,
  PendingProjectParticipant,
  PROJECTS_SERVICE_NAME
} from '@app/common/generated/project';
import { ProjectServicePort } from '../ports/project-service.port';

@Injectable()
export class ProjectServiceAdapter implements ProjectServicePort, OnModuleInit {
  private projectService: ProjectsServiceClient;

  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.projectService =
      this.projectClient.getService<ProjectsServiceClient>(PROJECTS_SERVICE_NAME);
  }

  async getProject(projectId: number): Promise<Project | null> {
    const response = await firstValueFrom(
      this.projectService.getProject({ id: projectId }),
    );

    return response.project || null;
  }

  async addParticipant(params: {
    projectId: number;
    userId: number;
    studentCode: string;
  }): Promise<AddParticipantResponse> {
    return await firstValueFrom(this.projectService.addParticipant(params));
  }

  async addProjectTutor(params: {
    projectId: number;
    userId: number;
    email: string;
  }): Promise<void> {
    await firstValueFrom(this.projectService.addProjectTutor(params));
  }

  async listPendingParticipants(
    projectId: number,
  ): Promise<PendingProjectParticipant[]> {
    const response = await firstValueFrom(
      this.projectService.listPendingParticipants({ projectId }),
    );

    return response.items ?? [];
  }
}