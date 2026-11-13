import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventRepository } from '../../domain/repositories/event.repository';
import { UpdateEventDTO } from '../dto/update-event.dto';
import { parseBogotaToUTC } from '@events/domain/utils/timezone.util';

@Injectable()
export class UpdateEventUC {
  constructor(private readonly repo: EventRepository) {}

  async execute(input: UpdateEventDTO) {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: `Event with id ${input.id} not found`,
      });
    }

    // Convert input dates from Colombia timezone (UTC-5) to UTC for storage
    // Date validation when dates are being updated
    const inscriptionDeadline = input.inscriptionDeadline
      ? parseBogotaToUTC(input.inscriptionDeadline)
      : existing.inscriptionDeadline;
    const startDate = input.startDate
      ? parseBogotaToUTC(input.startDate)
      : existing.startDate;
    const endDate = input.endDate 
      ? parseBogotaToUTC(input.endDate)  
      : existing.endDate;

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

    if (input.accessCode && input.accessCode !== existing.accessCode) {
      const existingEvent = await this.repo.findByAccessCode(input.accessCode);
      if (existingEvent) {
        throw new RpcException({
          code: 6,
          message: `Event with accessCode "${input.accessCode}" already exists`,
        });
      }
    }


    return this.repo.update(input.id, {
      name: input.name,
      description: input.description,
      accessCode: input.accessCode,
      isPubliclyJoinable: input.isPubliclyJoinable,
      inscriptionCost: input.inscriptionCost,
      inscriptionDeadline: input.inscriptionDeadline
        ? parseBogotaToUTC(input.inscriptionDeadline)
        : undefined,
      evaluationsOpened: input.evaluationsOpened,
      resultsPublished: input.resultsPublished,
      startDate: input.startDate 
        ? parseBogotaToUTC(input.startDate) 
        : undefined,
      endDate: input.endDate 
        ? parseBogotaToUTC(input.endDate) 
        : undefined,
      active: input.active,
      location: input.location,
      locationDetails: input.locationDetails,
      evaluationType: input.evaluationType,
      inscriptionRequirements: input.inscriptionRequirements,
      minimumTeamSize: input.minimumTeamSize,
      aboutOurAllies: input.aboutOurAllies,
      eventType: input.eventType,
      collaborators: input.collaborators,
      organizers: input.organizers,
    });
  }
}
