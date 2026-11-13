// apps/project-service/src/modules/projects/application/use-cases/create-project.uc.ts
import { Inject, Injectable } from '@nestjs/common';
import { NOTIFICATION_SERVICE_PORT, NotificationServicePort } from '../ports/notification-service.port';
import { NotificateStudentDTO } from '../dto/notificate-student.dto';
import { ConflictError } from '../../domain/errors';
import { EmailTemplate } from '@app/common/generated/notification';

@Injectable()
export class NotificateStudentUC {
  constructor(
    @Inject(NOTIFICATION_SERVICE_PORT)
    private readonly notificationService: NotificationServicePort,
  ) {}

  async execute(input: NotificateStudentDTO) {
    const firstName = input.firstName || 'Estudiante';
    const email = input.email;
    const lastName = input.lastName || '';
    const projectName = input.projectName;

    const result = await this.notificationService.sendEmail({
      to: email,
      template: EmailTemplate.PROJECT_SUBMITTED,
      params: { firstName, lastName, projectName },
    });
    if (!result.success) {
        throw new ConflictError('Error al enviar el correo de notificación');
  }
    return { success: true };
    }
}
