import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { CreateEventDTO } from '@events/application/dto/create-event.dto';
import { parseBogotaToUTC } from '@events/domain/utils/timezone.util';

@Injectable()
export class CreateEventUC {
  constructor(private readonly repo: EventRepository) {}

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
          'Validación fallida: inscriptionDeadline debe ser anterior a startDate',
      });
    }

    if (startDate >= endDate) {
      throw new RpcException({
        code: 3,
        message: 'Validación fallida: startDate debe ser anterior a endDate',
      });
    }

    const existingEvent = await this.repo.findByAccessCode(input.accessCode);
    if (existingEvent) {
      throw new RpcException({
        code: 6,
        message: `Ya existe un evento con el código de acceso "${input.accessCode}"`,
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
    });
  }
}
