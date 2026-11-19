import * as path from 'path';
import { EmailTemplate } from '@app/common/generated/notification';
import { EmailTemplateRenderer, htmlToText } from '../email-template.renderer';

describe('EmailTemplateRenderer', () => {
  const renderer = new EmailTemplateRenderer(
    path.join(__dirname, '..', 'templates'),
  );

  it('renders subject, HTML and plain text from the template', async () => {
    const email = await renderer.render(EmailTemplate.JUROR_INVITATION, {
      currentYear: 1999,
    });

    expect(email.subject).not.toBe('');
    expect(email.html).toContain('1999');
    expect(email.text).toContain('1999');
    expect(email.text).not.toMatch(/<[a-z]/i);
  });

  describe('platform invitation', () => {
    const link = 'https://iris.test/auth/chg-password?token=abc';

    it('renders an HTML email with the access link and the roles', async () => {
      const email = await renderer.render(EmailTemplate.PLATFORM_INVITATION, {
        firstName: 'Laura',
        invitationLink: link,
        // Role names as stored in auth-service, joined by create-invitation
        roles: 'Admin, User',
      });

      expect(email.subject).toBe('Iris | Invitación a la plataforma');
      expect(email.html).toContain('<!DOCTYPE html>');
      expect(email.html).toContain(`<a href="${link.replace('=', '&#x3D;')}">`);
      expect(email.html).toContain('Laura');
      expect(email.html).toContain('Admin, User');
      expect(email.text).toContain(
        `Haz clic aquí para ver tu invitación (${link})`,
      );
    });

    it('tells new users to set a password and existing users to accept', async () => {
      const email = await renderer.render(EmailTemplate.PLATFORM_INVITATION, {
        firstName: 'Laura',
        invitationLink: 'https://iris.test/app/invitations',
        roles: 'Admin',
      });

      expect(email.text).toContain('crear tu contraseña');
      expect(email.text).toContain('acepta la invitación para activar tus roles');
    });

    it('leaves out the roles paragraph when no roles are given', async () => {
      const email = await renderer.render(EmailTemplate.PLATFORM_INVITATION, {
        firstName: 'Laura',
        invitationLink: link,
        roles: '',
      });

      expect(email.html).not.toContain('La invitación incluye');
      expect(email.html).toContain('ver tu invitación');
    });
  });

  it('rejects an unknown template', async () => {
    await expect(renderer.render(-1 as EmailTemplate)).rejects.toThrow(
      'Unsupported email template',
    );
  });
});

describe('htmlToText', () => {
  it('drops styles and tags, keeps links and line breaks', () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body>' +
      '<p>Hola&nbsp;Laura</p><p>Entra <a href="https://iris.test/x">aqui</a></p>' +
      '</body></html>';

    expect(htmlToText(html)).toBe(
      'Hola Laura\nEntra aqui (https://iris.test/x)',
    );
  });

  it('decodes the escapes handlebars writes, once', () => {
    const html =
      '<p><a href="https://iris.test/a?token&#x3D;x&amp;b&#x3D;1">ir</a> O&#x27;Neil &amp;lt;</p>';

    expect(htmlToText(html)).toBe(
      "ir (https://iris.test/a?token=x&b=1) O'Neil &lt;",
    );
  });
});
