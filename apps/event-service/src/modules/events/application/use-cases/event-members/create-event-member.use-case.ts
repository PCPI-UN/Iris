import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventMemberRepository } from '@events/domain/repositories/event-member.repository';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { CreateEventMemberDTO } from '@events/application/dto/event-members/create-event-member.dto';
import { EventMember } from '@events/domain/entities/event-member.entity';
import { AuthClientPort } from '@events/infrastructure/ports/auth-client.port';
import { parseBogotaToUTC } from '@events/domain/utils/timezone.util';

@Injectable()
export class CreateEventMemberUseCase {
  private readonly logger = new Logger(CreateEventMemberUseCase.name);

  constructor(
    private readonly eventMemberRepository: EventMemberRepository,
    private readonly eventRepository: EventRepository,
    private readonly authClient: AuthClientPort,
  ) {}

  async execute(input: CreateEventMemberDTO): Promise<EventMember> {
    // 1. Validate event exists
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) {
      throw new RpcException({
        code: 5,
        message: `No se encontró el evento con ID ${input.eventId}`,
      });
    }

    // 2. Validate event is active
    if (!event.active) {
      throw new RpcException({
        code: 9,
        message: 'El evento no está activo y no puede recibir miembros nuevos',
      });
    }

    // 3. Validate user exists
    try {
      const user = await this.authClient.getUser(input.userId);
      if (!user) {
        throw new RpcException({
          code: 3,
          message: `No se encontró el usuario con ID ${input.userId}`,
        });
      }
    } catch (error) {
      this.logger.error(`Error fetching user ${input.userId}: ${error.message}`);
      throw new RpcException({
        code: 3,
        message: `No se encontró el usuario con ID ${input.userId}`,
      });
    }

    // 4. Validate role exists and is EVENT-scoped
    let role;
    try {
      const rolesResponse = await this.authClient.getRolesByIds([input.roleId]);

      if (!rolesResponse.roles || rolesResponse.roles.length === 0) {
        throw new RpcException({
          code: 3,
          message: `No se encontró el rol con ID ${input.roleId}`,
        });
      }

      role = rolesResponse.roles[0];
      if (role.scope !== 'EVENT') {
        throw new RpcException({
          code: 3,
          message: `El rol con ID ${input.roleId} no es un rol de evento (alcance: ${role.scope})`,
        });
      }
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      this.logger.error(`Error fetching role ${input.roleId}: ${error.message}`);
      throw new RpcException({
        code: 3,
        message: `No se encontró el rol con ID ${input.roleId}`,
      });
    }

    const now = new Date();
    const isJuror = role.name.toLowerCase() === 'juror';

    // Event has already ended - no one can join
    if (now > event.endDate) {
      this.logger.log(`Event ${input.eventId} has already ended on ${event.endDate.toISOString()}. Cannot add new members.`);
      throw new RpcException({
        code: 9,
        message: 'El evento ya terminó',
      });
    }

    const existingMember = await this.eventMemberRepository.findActiveByUserAndEvent(
      input.userId,
      input.eventId,
    );

    if (existingMember) {
      this.logger.log(
        `User ${input.userId} already has an active membership in event ${input.eventId} with role ${existingMember.roleId}. Returning existing membership (idempotent).`,
      );
      return existingMember;
    }

    // 7. Create the event member
    return this.eventMemberRepository.create({
      userId: input.userId,
      eventId: input.eventId,
      roleId: input.roleId,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}