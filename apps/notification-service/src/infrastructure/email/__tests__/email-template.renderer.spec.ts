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
});
