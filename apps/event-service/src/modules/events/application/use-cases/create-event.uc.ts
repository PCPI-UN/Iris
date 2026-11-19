import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { CreateEventDTO } from '@events/application/dto/create-event.dto';
import { parseBogotaToUTC } from '@events/domain/utils/timezone.util';
import { TermRepository } from '@events/domain/repositories/term.repository';
import { assertSelectableTerm } from '@events/application/use-cases/assert-selectable-term';

@Injectable()
export class CreateEventUC {
  constructor(
    private readonly repo: EventRepository,
    private readonly terms: TermRepository,
  ) {}

  async execute(input: CreateEventDTO) {
    // Convert input dates from Colombia timezone (UTC-5) to UTC for storage
    // Assumes input dates are in Colombia local time
    const inscriptionDeadline = parseBogotaToUTC(input.inscriptionDeadline);
    const startDate = parseBogotaToUTC(input.startDate);
    const endDate = parseBogotaToUTC(input.endDate);

    if (inscriptionDeadline >= startDate) {
      throw new RpcException({
        code: 3,
        message:
          'Validation failed: inscriptionDeadline must be before startDate',
      });
    }

    if (startDate >= endDate) {
      throw new RpcException({
        code: 3,
        message: 'Validation failed: startDate must be before endDate',
      });
    }

    await assertSelectableTerm(this.terms, input.termId);

    const existingEvent = await this.repo.findByAccessCode(input.accessCode);
    if (existingEvent) {
      throw new RpcException({
        code: 6,
        message: `Event with accessCode "${input.accessCode}" already exists`,
      });
    }

    return this.repo.create({
      name: input.name,
      description: input.description,
      accessCode: input.accessCode,
      isPubliclyJoinable: input.isPubliclyJoinable ?? false,
      inscriptionDeadline,
      inscriptionCost: input.inscriptionCost ?? null,
      evaluationsOpened: input.evaluationsOpened ?? false,
      startDate,
      endDate,
      location: input.location,
      locationDetails: input.locationDetails ?? null,
      evaluationType: input.evaluationType,
      inscriptionRequirements: input.inscriptionRequirements ?? null,
      minimumTeamSize: input.minimumTeamSize ?? null,
      aboutOurAllies: input.aboutOurAllies ?? null,
      eventType: input.eventType,
      collaborators: input.collaborators ?? [],
      organizers: input.organizers ?? [],
      active: true,
      createdByUserId: input.createdByUserId ?? 0,
      termId: input.termId,
      requiresCourse: input.requiresCourse,
    });
  }
}
