import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventRepository } from '../../domain/repositories/event.repository';
import { UpdateEventDTO } from '../dto/update-event.dto';
import { parseBogotaToUTC } from '@events/domain/utils/timezone.util';
import { TermRepository } from '@events/domain/repositories/term.repository';
import { assertSelectableTerm } from '@events/application/use-cases/assert-selectable-term';

@Injectable()
export class UpdateEventUC {
  constructor(
    private readonly repo: EventRepository,
    private readonly terms: TermRepository,
  ) {}

  async execute(input: UpdateEventDTO) {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: `No se encontró el evento con ID ${input.id}`,
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
          'Validación fallida: inscriptionDeadline debe ser anterior a startDate',
      });
    }

    if (startDate >= endDate) {
      throw new RpcException({
        code: 3,
        message: 'Validación fallida: startDate debe ser anterior a endDate',
      });
    }

    // An event still on the "no term" row can be edited without choosing one (for example
    // to publish its results); a term that is sent must be a real one
    if (input.termId !== undefined) {
      await assertSelectableTerm(this.terms, input.termId);
    }

    if (input.accessCode && input.accessCode !== existing.accessCode) {
      const existingEvent = await this.repo.findByAccessCode(input.accessCode);
      if (existingEvent) {
        throw new RpcException({
          code: 6,
          message: `Ya existe un evento con el código de acceso "${input.accessCode}"`,
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
      termId: input.termId,
      requiresCourse: input.requiresCourse,
    });
  }
}
