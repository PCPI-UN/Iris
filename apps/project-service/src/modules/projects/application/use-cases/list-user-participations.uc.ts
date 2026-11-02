import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { UserParticipation } from '../../domain/entities/project.entity';

@Injectable()
export class ListUserParticipationsUC {
    constructor(
        @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    ) { }

    // Projects where the user is a confirmed participant, most recent first
    async execute(input: { userId: number }): Promise<UserParticipation[]> {
        return this.repo.listParticipationsByUser(input.userId);
    }
}
