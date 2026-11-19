import { EmailTemplate } from '@app/common/generated/notification';
import { ApproveProjectUC } from '../src/modules/projects/application/use-cases/approve-project.uc';
import { ProjectRepository } from '../src/modules/projects/domain/repositories/project.repository';
import { NotificationServicePort } from '../src/modules/projects/application/ports/notification-service.port';
import { NotFoundError, ValidationError } from '../src/modules/projects/domain/errors';

describe('ApproveProjectUC', () => {
  let repo: { findById: jest.Mock; setProjectState: jest.Mock; listPendingParticipants: jest.Mock };
  let notifications: { sendEmail: jest.Mock };
  let uc: ApproveProjectUC;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue({ id: 10, name: 'Robot', state: 'UNDER_REVIEW' }),
      setProjectState: jest.fn(async (id: number, state: string) => ({ id, name: 'Robot', state })),
      listPendingParticipants: jest.fn().mockResolvedValue([
        { email: 'a@mail.com', firstName: 'A', lastName: null },
        { email: 'b@mail.com', firstName: null, lastName: 'Doe' },
      ]),
    };
    notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    uc = new ApproveProjectUC(
      repo as unknown as ProjectRepository,
      notifications as unknown as NotificationServicePort,
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('approves the project and emails each pending participant with the approval template', async () => {
    await expect(uc.execute({ id: 10, actingUserId: 999, eventType: 'Exposition' })).resolves.toMatchObject({
      state: 'APPROVED',
    });

    expect(repo.setProjectState).toHaveBeenCalledWith(10, 'APPROVED');
    expect(notifications.sendEmail).toHaveBeenCalledTimes(2);
    expect(notifications.sendEmail).toHaveBeenNthCalledWith(1, {
      to: 'a@mail.com',
      template: EmailTemplate.PROJECT_APPROVED,
      params: { firstName: 'A', lastName: '', projectName: 'Robot' },
    });
    // Without a first name the email greets "Estudiante"
    expect(notifications.sendEmail).toHaveBeenNthCalledWith(2, {
      to: 'b@mail.com',
      template: EmailTemplate.PROJECT_APPROVED,
      params: { firstName: 'Estudiante', lastName: 'Doe', projectName: 'Robot' },
    });
  });

  it('uses the participants template in a competition', async () => {
    await uc.execute({ id: 10, actingUserId: 999, eventType: 'Competition' });

    expect(notifications.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: EmailTemplate.PARTICIPANTS_APPROVED }),
    );
  });

  it('keeps emailing the others when one email fails', async () => {
    notifications.sendEmail.mockRejectedValueOnce(new Error('unavailable'));

    await uc.execute({ id: 10, actingUserId: 999, eventType: 'Exposition' });

    expect(notifications.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('returns an approved project as it is, without emails', async () => {
    repo.findById.mockResolvedValue({ id: 10, name: 'Robot', state: 'APPROVED' });

    await uc.execute({ id: 10, actingUserId: 999, eventType: 'Exposition' });

    expect(repo.setProjectState).not.toHaveBeenCalled();
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a project that is not under review', async () => {
    repo.findById.mockResolvedValue({ id: 10, name: 'Robot', state: 'REJECTED' });

    await expect(uc.execute({ id: 10, actingUserId: 999, eventType: 'Exposition' })).rejects.toThrow(ValidationError);
    expect(repo.setProjectState).not.toHaveBeenCalled();
  });

  it('rejects a project that does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(uc.execute({ id: 10, actingUserId: 999, eventType: 'Exposition' })).rejects.toThrow(NotFoundError);
  });
});
