import * as fs from 'fs/promises';
import * as handlebars from 'handlebars';
// gray-matter is CommonJS and this project has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matter = require('gray-matter') as typeof import('gray-matter');
import { EmailTemplate } from '@app/common/generated/notification';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const TEMPLATE_FILES: Partial<Record<EmailTemplate, string>> = {
  [EmailTemplate.PROJECT_SUBMITTED]: 'project_submitted',
  [EmailTemplate.PROJECT_TUTOR_INVITATION]: 'project_tutor_invitation',
  [EmailTemplate.PROJECT_APPROVED]: 'project_approved',
  [EmailTemplate.PROJECT_REJECTED]: 'project_rejected',
  [EmailTemplate.REQUEST_CHANGES]: 'requested_changes',
  [EmailTemplate.JUROR_INVITATION]: 'juror_invitation',
  [EmailTemplate.PASSWORD_CHANGED]: 'password_changed',
  [EmailTemplate.PASSWORD_RESET]: 'password_reset',
  [EmailTemplate.PLATFORM_INVITATION]: 'platform_invitation',
  [EmailTemplate.SIGNUP_CONFIRMATION]: 'signup_confirmation',
  [EmailTemplate.PARTICIPANTS_SUBMITTED]: 'participants_submitted',
  [EmailTemplate.PARTICIPANTS_APPROVED]: 'participants_approved',
  [EmailTemplate.PARTICIPANTS_REJECTED]: 'participants_rejected',
};

const TEMPLATES_DIR =
  'dist/apps/notification-service/infrastructure/email/templates';

/** Renders a template to subject, HTML and a plain-text version. */
export class EmailTemplateRenderer {
  constructor(private readonly templatesDir = TEMPLATES_DIR) {}

  async render(
    template: EmailTemplate,
    params: Record<string, unknown> = {},
  ): Promise<RenderedEmail> {
    const file = TEMPLATE_FILES[template];
    if (!file) throw new Error(`Unsupported email template: ${template}`);

    const raw = await fs.readFile(
      `${this.templatesDir}/iris_${file}.html`,
      'utf-8',
    );
    const { data, content } = matter(raw) as {
      data: { subject?: string };
      content: string;
    };

    const values = { currentYear: new Date().getFullYear(), ...params };
    const html = handlebars.compile(content)(values);

    return {
      subject: handlebars.compile(data.subject ?? '')(values),
      html,
      text: htmlToText(html),
    };
  }
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  // Escapes written by handlebars in {{ }} values, e.g. the "=" of "?token=" in a link
  '&#x27;': "'",
  '&#x60;': '`',
  '&#x3D;': '=',
};

/** Plain-text alternative for clients that do not render HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(nbsp|lt|gt|quot|#39|#x27|#x60|#x3D);/g,
      (entity) => ENTITIES[entity],
    )
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
