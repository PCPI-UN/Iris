import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { ProjectClientPort } from '../ports/project-client.port';
import {
  EventRoles,
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
} from '@app/common/generated/project';

@Injectable()
export class GrpcProjectClientAdapter
  extends ProjectClientPort
  implements OnModuleInit
{
  private projectsService: ProjectsServiceClient;

  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly client: ClientGrpc,
  ) {
    super();
  }

  onModuleInit() {
    this.projectsService = this.client.getService<ProjectsServiceClient>(
      PROJECTS_SERVICE_NAME,
    );
  }

  async listMyEventRoles(userId: number): Promise<EventRoles[]> {
    const response = await lastValueFrom(
      this.projectsService.listMyEventRoles({ userId }),
    );
    return response.events ?? [];
  }
}
