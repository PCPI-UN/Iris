import { Inject, Injectable } from '@nestjs/common';
import { normalizeEmail } from '@app/common/utils/email.util';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  JUROR_ROLE_ID,
  ProjectState,
  ProjectWithJurorIds,
} from '../../domain/entities/project.entity';
import { ValidationError } from '../../domain/errors';
import { getJurorImportEvent, JurorImportEvent } from './juror-import-event';
import {
  EVENT_SERVICE_PORT,
  EventCategory,
  EventMembership,
  EventServicePort,
} from '../ports/event-service.port';
import {
  AUTH_SERVICE_PORT,
  AuthServicePort,
  AuthUser,
} from '../ports/auth-service.port';

/** Same limit the gateway enforces; it keeps the gRPC messages far below 4 MB */
export const MAX_JUROR_IMPORT_ROWS = 2000;
const LOOKUP_CONCURRENCY = 10;

export type JurorImportOutcome = 'ASSIGN' | 'SKIP' | 'ERROR';
export type JurorImportUserStatus =
  | 'NEW_USER'
  | 'EVENT_JUROR'
  | 'INVITE_TO_EVENT';

export interface JurorImportRowInput {
  rowNumber: number;
  department: string;
  projectCode: string;
  jurorName: string;
  email: string;
}

export interface JurorImportRowResult {
  rowNumber: number;
  outcome: JurorImportOutcome;
  userStatus?: JurorImportUserStatus;
  message: string;
  email: string;
  jurorName: string;
  projectId?: number;
  projectName?: string;
  userId?: number;
}

export interface JurorImportTotals {
  rows: number;
  toAssign: number;
  skipped: number;
  errors: number;
  jurors: number;
  newUsers: number;
  invitesToEvent: number;
}

export interface JurorImportPreview {
  rows: JurorImportRowResult[];
  totals: JurorImportTotals;
  eventWarnings: string[];
  canConfirm: boolean;
}

interface ResolvedUser {
  user: AuthUser | null;
  membership: EventMembership | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATE_LABELS: Record<ProjectState, string> = {
  UNDER_REVIEW: 'en revisión',
  APPROVED: 'aprobado',
  REJECTED: 'rechazado',
  REQUEST_CHANGES: 'con cambios solicitados',
};

const REQUIRED_FIELDS: { key: keyof JurorImportRowInput; label: string }[] = [
  { key: 'department', label: 'Departamento' },
  { key: 'projectCode', label: 'Número' },
  { key: 'jurorName', label: 'Jurado' },
  { key: 'email', label: 'Email' },
];

/** Trimmed, single-spaced, lowercase and without accents: "Dpt.  Ingeniería" -> "dpt. ingenieria" */
const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** "05" and "5" are the same project number; other codes compare as text */
const normalizeCode = (value: string): string => {
  const code = value.trim();
  return /^\d+$/.test(code) ? String(Number(code)) : normalizeText(code);
};

const projectKey = (categoryId: number, code: string) =>
  `${categoryId}|${normalizeCode(code)}`;

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Validates the rows of a juror import against the event and reports, row by row,
 * what confirming would do. It writes nothing and sends no email.
 */
@Injectable()
export class PreviewJurorImportUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
  ) {}

  async execute(input: {
    eventId: number;
    rows: JurorImportRowInput[];
  }): Promise<JurorImportPreview> {
    const { eventId, rows } = input;
    if (!rows?.length) {
      throw new ValidationError('El archivo no tiene filas con datos.');
    }
    if (rows.length > MAX_JUROR_IMPORT_ROWS) {
      throw new ValidationError(
        `El archivo tiene ${rows.length} filas con datos; el máximo es ${MAX_JUROR_IMPORT_ROWS}.`,
      );
    }

    const event = await getJurorImportEvent(this.events, eventId);
    const eventWarnings = this.eventWarnings(event);

    const [categories, projects] = await Promise.all([
      this.events.listCategoriesByEvent(eventId),
      this.repo.listWithJurorsByEvent(eventId),
    ]);
    const categoriesByName = this.groupCategories(categories);
    const projectsByKey = new Map<string, ProjectWithJurorIds[]>();
    for (const project of projects) {
      if (!project.projectCode?.trim()) continue;
      const key = projectKey(project.courseId, project.projectCode);
      projectsByKey.set(key, [...(projectsByKey.get(key) ?? []), project]);
    }

    const emails = [
      ...new Set(
        rows
          .map((row) => normalizeEmail(row.email ?? ''))
          .filter((email) => EMAIL_PATTERN.test(email)),
      ),
    ];
    const resolved = new Map<string, ResolvedUser>();
    await mapWithConcurrency(emails, LOOKUP_CONCURRENCY, async (email) => {
      resolved.set(email, await this.resolveUser(email, eventId));
    });

    const firstRowByKey = new Map<string, number>();
    const results = rows.map((row) =>
      this.evaluateRow(row, {
        categoriesByName,
        projectsByKey,
        resolved,
        firstRowByKey,
      }),
    );

    const totals = this.totals(results);
    return {
      rows: results,
      totals,
      eventWarnings,
      canConfirm:
        totals.errors === 0 &&
        eventWarnings.length === 0 &&
        totals.toAssign > 0,
    };
  }

  /** Same conditions CreateEventMember checks when an invitation is accepted */
  private eventWarnings(event: JurorImportEvent) {
    const warnings: string[] = [];
    if (!event.active) {
      warnings.push('El evento está inactivo.');
    }
    if (event.endDate && new Date(event.endDate).getTime() < Date.now()) {
      warnings.push(
        `El evento ya terminó (fecha de fin: ${formatDate(event.endDate)}).`,
      );
    }
    return warnings;
  }

  private groupCategories(categories: EventCategory[]) {
    const byName = new Map<string, EventCategory[]>();
    for (const category of categories) {
      const key = normalizeText(category.name);
      byName.set(key, [...(byName.get(key) ?? []), category]);
    }
    return byName;
  }

  private async resolveUser(
    email: string,
    eventId: number,
  ): Promise<ResolvedUser> {
    const user = await this.auth.findUserByEmail(email);
    if (!user) return { user: null, membership: null };
    const membership = await this.events.getEventMember(user.id, eventId);
    return { user, membership };
  }

  private evaluateRow(
    row: JurorImportRowInput,
    ctx: {
      categoriesByName: Map<string, EventCategory[]>;
      projectsByKey: Map<string, ProjectWithJurorIds[]>;
      resolved: Map<string, ResolvedUser>;
      firstRowByKey: Map<string, number>;
    },
  ): JurorImportRowResult {
    const department = (row.department ?? '').trim();
    const code = (row.projectCode ?? '').trim();
    const jurorName = (row.jurorName ?? '').trim();
    const rawEmail = (row.email ?? '').trim();
    const email = normalizeEmail(rawEmail);
    const base = { rowNumber: row.rowNumber, email, jurorName };
    const error = (
      message: string,
      extra: Partial<JurorImportRowResult> = {},
    ) =>
      ({
        ...base,
        ...extra,
        outcome: 'ERROR',
        message,
      }) as JurorImportRowResult;

    // 1. Required fields
    const missing = REQUIRED_FIELDS.filter(
      ({ key }) => !String(row[key] ?? '').trim(),
    ).map(({ label }) => label);
    if (missing.length === 1) {
      return error(`Falta el dato obligatorio: ${missing[0]}.`);
    }
    if (missing.length > 1) {
      return error(`Faltan los datos obligatorios: ${missing.join(', ')}.`);
    }

    // 2. Email format
    if (!EMAIL_PATTERN.test(email)) {
      return error(`El correo «${rawEmail}» no es válido.`);
    }

    // 3. Same department + number + email as an earlier row
    const rowKey = `${normalizeText(department)}|${normalizeCode(code)}|${email}`;
    const firstRow = ctx.firstRowByKey.get(rowKey);
    if (firstRow !== undefined) {
      return error(`Fila repetida: igual a la fila ${firstRow}.`);
    }
    ctx.firstRowByKey.set(rowKey, row.rowNumber);

    // 4. Department must be a category of the event
    const categories =
      ctx.categoriesByName.get(normalizeText(department)) ?? [];
    if (categories.length === 0) {
      return error(`El departamento «${department}» no existe en este evento.`);
    }
    if (categories.length > 1) {
      return error(
        `El departamento «${department}» coincide con varias categorías del evento.`,
      );
    }
    const category = categories[0];

    // 5-7. Exactly one approved project with that number in the department
    const matches = ctx.projectsByKey.get(projectKey(category.id, code)) ?? [];
    if (matches.length === 0) {
      return error(`No hay proyecto con número ${code} en «${category.name}».`);
    }
    if (matches.length > 1) {
      const ids = matches.map((p) => p.id).join(', ');
      return error(
        `Hay ${matches.length} proyectos con número ${code} en «${category.name}» (Id ${ids}). Corrija el número en IRIS antes de cargar.`,
      );
    }
    const project = matches[0];
    const projectInfo = { projectId: project.id, projectName: project.name };
    if (project.state !== 'APPROVED') {
      return error(
        `El proyecto ${code} de «${category.name}» no está aprobado (estado: ${STATE_LABELS[project.state] ?? project.state}).`,
        projectInfo,
      );
    }

    // 8. Juror by email
    const { user, membership } = ctx.resolved.get(email) ?? {
      user: null,
      membership: null,
    };
    if (!user) {
      return {
        ...base,
        ...projectInfo,
        outcome: 'ASSIGN',
        userStatus: 'NEW_USER',
        message:
          'Jurado nuevo: se creará su cuenta y recibirá la invitación al confirmar.',
      };
    }
    const userInfo = { ...projectInfo, userId: user.id };
    if (membership && membership.roleId !== JUROR_ROLE_ID) {
      return error(
        `${email} ya está en este evento con otro rol; no puede ser jurado.`,
        userInfo,
      );
    }
    const userStatus: JurorImportUserStatus = membership
      ? 'EVENT_JUROR'
      : 'INVITE_TO_EVENT';

    // 9. Already assigned
    if (project.jurorUserIds.includes(user.id)) {
      return {
        ...base,
        ...userInfo,
        outcome: 'SKIP',
        userStatus,
        message: 'Ya estaba asignado a este proyecto; se omite.',
      };
    }

    return {
      ...base,
      ...userInfo,
      outcome: 'ASSIGN',
      userStatus,
      message:
        userStatus === 'EVENT_JUROR'
          ? 'Jurado del evento.'
          : 'Usuario existente: recibirá la invitación al evento al confirmar.',
    };
  }

  private totals(results: JurorImportRowResult[]): JurorImportTotals {
    const toAssign = results.filter((r) => r.outcome === 'ASSIGN');
    const distinct = (rows: JurorImportRowResult[]) =>
      new Set(rows.map((r) => r.email)).size;
    return {
      rows: results.length,
      toAssign: toAssign.length,
      skipped: results.filter((r) => r.outcome === 'SKIP').length,
      errors: results.filter((r) => r.outcome === 'ERROR').length,
      jurors: distinct(toAssign),
      newUsers: distinct(toAssign.filter((r) => r.userStatus === 'NEW_USER')),
      invitesToEvent: distinct(
        toAssign.filter((r) => r.userStatus === 'INVITE_TO_EVENT'),
      ),
    };
  }
}
