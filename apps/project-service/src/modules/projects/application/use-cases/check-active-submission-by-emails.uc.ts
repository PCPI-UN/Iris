import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { normalizeEmail } from '@app/common/utils/email.util';

/**
 * Checks whether any of the given emails already has a pending project participant
 * in the same event for a project whose state != REJECTED.
 */
@Injectable()
export class CheckActiveSubmissionByEmailsUC {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: { eventId: number; emails: string[] }): Promise<{ hasConflict: boolean; conflictEmails: string[] }> {
    const normalized = (input.emails ?? [])
      .map((e) => normalizeEmail(String(e ?? '')))
      .filter(Boolean);

    if (!normalized.length) return { hasConflict: false, conflictEmails: [] };

    const rows = await this.prisma.pendingProjectParticipant.findMany({
      where: {
        email: { in: normalized },
        project: {
          eventId: input.eventId,
          state: { not: 'REJECTED' },
        },
      },
      select: { email: true },
    });

    const conflictEmails: string[] = Array.from(new Set(rows.map((r: { email: string; }) => String(r.email))));
    return { hasConflict: conflictEmails.length > 0, conflictEmails };
  }
}
