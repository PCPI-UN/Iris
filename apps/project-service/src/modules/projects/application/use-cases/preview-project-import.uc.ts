import { Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { normalizeEmail } from '@app/common/utils/email.util';
import { mapWithConcurrency } from '@app/common/utils/concurrency.util';
import { normalizeText } from '@app/common/utils/text.util';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROFESSOR_ROLE_ID,
  Project,
  ProjectState,
  TUTOR_ROLE_ID,
} from '../../domain/entities/project.entity';
import { DomainError, ValidationError } from '../../domain/errors';
import {
  EVENT_SERVICE_PORT,
  EventCategory,
  EventServicePort,
} from '../ports/event-service.port';
import {
  AUTH_SERVICE_PORT,
  AuthServicePort,
  AuthUser,
} from '../ports/auth-service.port';
import {
  ACTIVE_STATES,
  PendingStudentInput,
} from '../services/project-enrollment.service';
import { CheckActiveSubmissionByEmailsUC } from './check-active-submission-by-emails.uc';
import { CreateProjectUC } from './create-project.uc';
import { AdminCreateState } from './admin-create-project.uc';
import {
  eventRequiresCourse,
  getProjectImportEvent,
  ProjectImportEvent,
} from './project-import-event';

/** Same limit the gateway enforces */
export const MAX_PROJECT_IMPORT_ROWS = 500;
const LOOKUP_CONCURRENCY = 10;
const NAME_MIN = 3;
const NAME_MAX = 255;
const DESCRIPTION_MAX = 3000;
/** Column limits of the tables, the same the admin form checks */
const PROJECT_CODE_MAX = 50;
const STUDENT_CODE_MAX = 20;
const PERSON_NAME_MAX = 100;
const EMAIL_MAX = 255;

export type ProjectImportOutcome = 'CREATE' | 'SKIP' | 'ERROR' | 'CREATED';
export type ProjectImportParticipantStatus = 'HAS_ACCOUNT' | 'NO_ACCOUNT';

/** A student of a row; `slot` is the N of "integrante N" in the sheet */
export type ProjectImportParticipantInput = PendingStudentInput & {
  slot?: number;
};

export interface ProjectImportRowInput {
  /** Spreadsheet row, 1-based as the user sees it */
  rowNumber: number;
  categoryName: string;
  nrc?: string;
  name: string;
  description?: string;
  projectCode?: string;
  /** APPROVED when left out */
  state?: ProjectState;
  /** In slot order, only the filled ones */
  participants: ProjectImportParticipantInput[];
  tutorEmails: string[];
  /** Problems the gateway found reading the row: the row is an ERROR and is not validated further */
  formatErrors?: string[];
}

export interface ProjectImportRowResult {
  rowNumber: number;
  outcome: ProjectImportOutcome;
  /** In Spanish, for the person who uploaded the file */
  message: string;
  projectName: string;
  /** The category of the event, as named in the event */
  categoryName?: string;
  state: ProjectState;
  participants: { email: string; status: ProjectImportParticipantStatus }[];
  /** SKIP: the existing project; CREATED: the new one */
  projectId?: number;
  /** Execution only: effects that failed after the project was saved */
  failedEffects?: string[];
}

export interface ProjectImportTotals {
  rows: number;
  toCreate: number;
  skipped: number;
  errors: number;
  /** Students in rows to create */
  participants: number;
  /** Of those, the ones without an account */
  withoutAccount: number;
}

export interface ProjectImportPreview {
  rows: ProjectImportRowResult[];
  totals: ProjectImportTotals;
  eventWarnings: string[];
  canConfirm: boolean;
}

/** What a CREATE row needs to be created, resolved by the preview */
export interface ProjectImportCreatePlan {
  courseId: number;
  state: AdminCreateState;
  tutorUserIds: number[];
}

export interface ProjectImportEvaluation {
  preview: ProjectImportPreview;
  /** By position of the row in the input: set only for CREATE rows */
  plans: (ProjectImportCreatePlan | undefined)[];
}

type NrcResolution = { ok: true } | { ok: false; message: string };

interface EvaluationContext {
  event: ProjectImportEvent;
  categoriesByName: Map<string, EventCategory[]>;
  categoryNameById: Map<number, string>;
  projectsByName: Map<string, Project>;
  projectById: Map<number, Project>;
  accounts: Map<string, AuthUser | null>;
  /** Project of the event (not REJECTED) each email already takes part in */
  busyEmails: Map<string, number>;
  tutorHolderIds: Set<number>;
  nrcs: Map<string, NrcResolution>;
  firstRowByName: Map<string, number>;
  firstRowByEmail: Map<string, number>;
}

const isValidEmail = (email: string): boolean => isEmail(email);

const text = (value: string | undefined | null): string => (value ?? '').trim();

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "Se creará con 3 integrantes (1 sin cuenta)" */
export const participantsSummary = (
  participants: { status: ProjectImportParticipantStatus }[],
): string => {
  const withoutAccount = participants.filter(
    (p) => p.status === 'NO_ACCOUNT',
  ).length;
  return `${plural(participants.length, 'integrante', 'integrantes')}${
    withoutAccount ? ` (${withoutAccount} sin cuenta)` : ''
  }`;
};

/**
 * Validates the rows of a project import against the event and reports, row by row, what
 * confirming would do: the same checks AdminCreateProjectUC makes, without writing anything.
 * A row whose name already exists in the event and the same category is skipped, so loading
 * the same file twice creates nothing the second time.
 */
@Injectable()
export class PreviewProjectImportUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
    private readonly createProject: CreateProjectUC,
    private readonly activeSubmissions: CheckActiveSubmissionByEmailsUC,
  ) {}

  async execute(input: {
    eventId: number;
    rows: ProjectImportRowInput[];
  }): Promise<ProjectImportPreview> {
    return (await this.evaluate(input)).preview;
  }

  /** The preview and, for each row to create, what its creation needs */
  async evaluate(input: {
    eventId: number;
    rows: ProjectImportRowInput[];
  }): Promise<ProjectImportEvaluation> {
    const { eventId, rows } = input;
    if (!rows?.length) {
      throw new ValidationError('El archivo no tiene proyectos con datos.');
    }
    if (rows.length > MAX_PROJECT_IMPORT_ROWS) {
      throw new ValidationError(
        `El archivo tiene ${rows.length} proyectos con datos; el máximo es ${MAX_PROJECT_IMPORT_ROWS}.`,
      );
    }

    const event = await getProjectImportEvent(this.events, eventId);
    const eventWarnings = this.eventWarnings(event);

    const [categories, projects] = await Promise.all([
      this.events.listCategoriesByEvent(eventId),
      this.repo.listWithJurorsByEvent(eventId),
    ]);

    const studentEmails = this.validEmails(
      rows.flatMap((row) => (row.participants ?? []).map((p) => p.email)),
    );
    const tutorEmails = this.validEmails(
      rows.flatMap((row) => row.tutorEmails ?? []),
    );
    const accounts = await this.lookupAccounts([
      ...new Set([...studentEmails, ...tutorEmails]),
    ]);
    const [busyEmails, tutorHolderIds, nrcs] = await Promise.all([
      this.loadBusyEmails(eventId, studentEmails, accounts),
      this.loadTutorHolders(tutorEmails, accounts),
      this.resolveNrcs(event, rows),
    ]);

    const ctx: EvaluationContext = {
      event,
      categoriesByName: this.groupCategories(
        categories.filter((c) => c.active !== false),
      ),
      categoryNameById: new Map(categories.map((c) => [c.id, c.name])),
      projectsByName: new Map(projects.map((p) => [p.name, p])),
      projectById: new Map(projects.map((p) => [p.id, p])),
      accounts,
      busyEmails,
      tutorHolderIds,
      nrcs,
      firstRowByName: new Map(),
      firstRowByEmail: new Map(),
    };

    const plans: (ProjectImportCreatePlan | undefined)[] = [];
    const results = rows.map((row, index) => {
      const { result, plan } = this.evaluateRow(row, ctx);
      plans[index] = plan;
      return result;
    });

    const totals = this.totals(results);
    return {
      preview: {
        rows: results,
        totals,
        eventWarnings,
        canConfirm:
          totals.errors === 0 &&
          eventWarnings.length === 0 &&
          totals.toCreate > 0,
      },
      plans,
    };
  }

  /** Same conditions CreateProjectUC checks for an administrator; a closed deadline is not one */
  private eventWarnings(event: ProjectImportEvent): string[] {
    const warnings: string[] = [];
    if (event.active === false) warnings.push('El evento está inactivo.');
    if (event.resultsPublished === true) {
      warnings.push(
        'El evento ya publicó sus resultados: no se le pueden crear proyectos.',
      );
    }
    return warnings;
  }

  private validEmails(emails: string[]): string[] {
    return [
      ...new Set(
        emails.map((e) => normalizeEmail(e ?? '')).filter(isValidEmail),
      ),
    ];
  }

  private groupCategories(categories: EventCategory[]) {
    const byName = new Map<string, EventCategory[]>();
    for (const category of categories) {
      const key = normalizeText(category.name);
      byName.set(key, [...(byName.get(key) ?? []), category]);
    }
    return byName;
  }

  private async lookupAccounts(emails: string[]) {
    const accounts = new Map<string, AuthUser | null>();
    await mapWithConcurrency(emails, LOOKUP_CONCURRENCY, async (email) => {
      accounts.set(email, await this.auth.findUserByEmail(email));
    });
    return accounts;
  }

  /**
   * The checks of ProjectEnrollmentService: a pending row (by email) or an enrolled
   * participation (by account) in a project of the event that is not REJECTED.
   */
  private async loadBusyEmails(
    eventId: number,
    emails: string[],
    accounts: Map<string, AuthUser | null>,
  ): Promise<Map<string, number>> {
    const busy = new Map<string, number>();
    if (!emails.length) return busy;
    const { conflicts } = await this.activeSubmissions.execute({
      eventId,
      emails,
    });
    for (const { email, projectId } of conflicts) {
      if (!busy.has(email)) busy.set(email, projectId);
    }
    const withAccount = emails.filter((e) => !busy.has(e) && accounts.get(e));
    await mapWithConcurrency(withAccount, LOOKUP_CONCURRENCY, async (email) => {
      const projects = await this.repo.listProjectsByParticipant(
        accounts.get(email)!.id,
        ACTIVE_STATES,
      );
      const inEvent = projects.find((p) => p.eventId === eventId);
      if (inEvent) busy.set(email, inEvent.id);
    });
    return busy;
  }

  /** Same rule as SetProjectTutorsUC.resolve: an active user with the Professor or Tutor role */
  private async loadTutorHolders(
    emails: string[],
    accounts: Map<string, AuthUser | null>,
  ): Promise<Set<number>> {
    const userIds = emails
      .map((email) => accounts.get(email)?.id)
      .filter((id): id is number => id !== undefined);
    if (!userIds.length) return new Set();
    const holders = await this.auth.findUsersByRoles({
      roleIds: [PROFESSOR_ROLE_ID, TUTOR_ROLE_ID],
      userIds,
    });
    return new Set(holders.map((h) => h.id));
  }

  /** Each distinct NRC once, as CreateProjectUC resolves it */
  private async resolveNrcs(
    event: ProjectImportEvent,
    rows: ProjectImportRowInput[],
  ): Promise<Map<string, NrcResolution>> {
    const resolved = new Map<string, NrcResolution>();
    if (!eventRequiresCourse(event)) return resolved;
    const codes = [
      ...new Set(rows.map((row) => text(row.nrc)).filter(Boolean)),
    ];
    await mapWithConcurrency(codes, LOOKUP_CONCURRENCY, async (code) => {
      try {
        await this.createProject.resolveAcademicCourse(event.termId, code);
        resolved.set(code, { ok: true });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        resolved.set(code, { ok: false, message: error.message });
      }
    });
    return resolved;
  }

  private evaluateRow(
    row: ProjectImportRowInput,
    ctx: EvaluationContext,
  ): { result: ProjectImportRowResult; plan?: ProjectImportCreatePlan } {
    const name = text(row.name);
    const state = row.state ?? 'APPROVED';
    const participants = (row.participants ?? [])
      .map((p) => normalizeEmail(p.email ?? ''))
      .filter(isValidEmail)
      .map((email): ProjectImportRowResult['participants'][number] => ({
        email,
        status: ctx.accounts.get(email) ? 'HAS_ACCOUNT' : 'NO_ACCOUNT',
      }));
    const base = (categoryName?: string) => ({
      rowNumber: row.rowNumber,
      projectName: name,
      categoryName,
      state,
      participants,
    });
    const error = (message: string, categoryName?: string) => ({
      result: { ...base(categoryName), outcome: 'ERROR' as const, message },
    });

    // The gateway could not read the row
    const formatErrors = (row.formatErrors ?? []).filter((e) => text(e));
    if (formatErrors.length) return error(formatErrors.join(' '));

    // 1. Required fields, lengths and emails
    const invalid = this.fieldErrors(row, ctx.event);
    if (invalid) return error(invalid);

    // A name repeated in the file: the second row would be rejected by the unique name
    const firstWithName = ctx.firstRowByName.get(name);
    if (firstWithName !== undefined) {
      return error(
        `Nombre repetido: igual al proyecto de la fila ${firstWithName}.`,
      );
    }
    ctx.firstRowByName.set(name, row.rowNumber);

    // 4a. Already created in that category: SKIP, even when the category was deactivated
    // afterwards, so that loading the same file again stays safe
    const existing = ctx.projectsByName.get(name);
    const existingCategory =
      existing && ctx.categoryNameById.get(existing.courseId);
    if (
      existing &&
      existingCategory !== undefined &&
      normalizeText(existingCategory) === normalizeText(row.categoryName)
    ) {
      return {
        result: {
          ...base(existingCategory),
          outcome: 'SKIP',
          projectId: existing.id,
          message: `Ya existe en el evento (Id ${existing.id}); se omite.`,
        },
      };
    }

    // 2. Category of the event, by normalized name; only active ones take new projects
    const matches =
      ctx.categoriesByName.get(normalizeText(row.categoryName)) ?? [];
    if (matches.length === 0) {
      return error(
        `La categoría «${text(row.categoryName)}» no existe en este evento.`,
      );
    }
    if (matches.length > 1) {
      return error(
        `La categoría «${text(row.categoryName)}» coincide con varias categorías del evento.`,
      );
    }
    const category = matches[0];
    const inCategory = (message: string) => error(message, category.name);

    // 4b. Name already in another category of the event (unique per event, compared as
    // AdminCreateProjectUC does)
    if (existing) {
      return inCategory(
        `Ya existe un proyecto con ese nombre en la categoría «${
          ctx.categoryNameById.get(existing.courseId) ?? existing.courseId
        }» de este evento (Id ${existing.id}).`,
      );
    }

    if (state !== 'APPROVED' && state !== 'UNDER_REVIEW') {
      return inCategory('El estado inicial debe ser Aprobado o En revisión.');
    }

    // 5. Students repeated in the file or already in another project of the event
    for (const { email } of participants) {
      const first = ctx.firstRowByEmail.get(email);
      if (first !== undefined && first !== row.rowNumber) {
        return inCategory(
          `El correo ${email} ya está en el proyecto de la fila ${first}.`,
        );
      }
    }
    for (const { email } of participants) {
      ctx.firstRowByEmail.set(email, row.rowNumber);
    }
    for (const { email } of participants) {
      const projectId = ctx.busyEmails.get(email);
      if (projectId !== undefined) {
        const other = ctx.projectById.get(projectId);
        return inCategory(
          `${email} ya está en otro proyecto del evento: «${other?.name ?? projectId}» (Id ${projectId}).`,
        );
      }
    }

    // 3. NRC in the term of the event
    if (eventRequiresCourse(ctx.event)) {
      const nrc = ctx.nrcs.get(text(row.nrc));
      if (nrc && !nrc.ok) return inCategory(`${nrc.message}.`);
    }

    // 6. Tutors
    const tutorUserIds: number[] = [];
    for (const raw of row.tutorEmails ?? []) {
      const email = normalizeEmail(raw ?? '');
      const account = ctx.accounts.get(email);
      if (!account || !ctx.tutorHolderIds.has(account.id)) {
        return inCategory(
          `El tutor ${email} no es un profesor ni un tutor activo de IRIS.`,
        );
      }
      if (!tutorUserIds.includes(account.id)) tutorUserIds.push(account.id);
    }

    return {
      result: {
        ...base(category.name),
        outcome: 'CREATE',
        message: `Se creará con ${participantsSummary(participants)}.`,
      },
      plan: { courseId: category.id, state, tutorUserIds },
    };
  }

  /** The first problem of the fields of the row, null when there is none */
  private fieldErrors(
    row: ProjectImportRowInput,
    event: ProjectImportEvent,
  ): string | null {
    const missing: string[] = [];
    if (!text(row.categoryName)) missing.push('Categoría');
    if (eventRequiresCourse(event) && !text(row.nrc)) missing.push('NRC');
    if (!text(row.name)) missing.push('Nombre del proyecto');
    const participants = row.participants ?? [];
    const slotOf = (p: ProjectImportParticipantInput, i: number) =>
      p.slot ?? i + 1;
    if (!participants.length || slotOf(participants[0], 0) !== 1) {
      missing.push('Integrante 1');
    }
    participants.forEach((p, i) => {
      const n = slotOf(p, i);
      if (!text(p.firstName)) missing.push(`Nombre(s) integrante ${n}`);
      if (!text(p.email)) missing.push(`Correo integrante ${n}`);
      if (!text(p.studentCode)) {
        missing.push(`Código estudiantil integrante ${n}`);
      }
      if (!text(p.semester)) missing.push(`Semestre integrante ${n}`);
      if (!text(p.career)) missing.push(`Carrera integrante ${n}`);
    });
    if (missing.length === 1) {
      return `Falta el dato obligatorio: ${missing[0]}.`;
    }
    if (missing.length > 1) {
      return `Faltan los datos obligatorios: ${missing.join(', ')}.`;
    }

    const name = text(row.name);
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return `El nombre del proyecto debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.`;
    }
    if (text(row.description).length > DESCRIPTION_MAX) {
      return `La descripción no puede pasar de ${DESCRIPTION_MAX} caracteres.`;
    }
    const projectCode = text(row.projectCode);
    if (projectCode && !/^\d+$/.test(projectCode)) {
      return `El código del proyecto «${projectCode}» debe tener solo números.`;
    }
    if (projectCode.length > PROJECT_CODE_MAX) {
      return `El código del proyecto no puede pasar de ${PROJECT_CODE_MAX} caracteres.`;
    }

    const emails: string[] = [];
    const codes: string[] = [];
    for (const [i, p] of participants.entries()) {
      const n = slotOf(p, i);
      const email = normalizeEmail(p.email);
      if (!isValidEmail(email) || email.length > EMAIL_MAX) {
        return `El correo «${text(p.email)}» del integrante ${n} no es válido.`;
      }
      if (
        text(p.firstName).length > PERSON_NAME_MAX ||
        text(p.lastName).length > PERSON_NAME_MAX
      ) {
        return `El nombre y el apellido del integrante ${n} no pueden pasar de ${PERSON_NAME_MAX} caracteres.`;
      }
      if (text(p.studentCode).length > STUDENT_CODE_MAX) {
        return `El código estudiantil del integrante ${n} no puede pasar de ${STUDENT_CODE_MAX} caracteres.`;
      }
      if (emails.includes(email)) {
        return `El correo ${email} está repetido entre los integrantes.`;
      }
      const code = text(p.studentCode);
      if (codes.includes(code)) {
        return `El código estudiantil ${code} está repetido entre los integrantes.`;
      }
      emails.push(email);
      codes.push(code);
    }
    for (const raw of row.tutorEmails ?? []) {
      const email = normalizeEmail(raw ?? '');
      if (!isValidEmail(email) || email.length > EMAIL_MAX) {
        return `El correo de tutor «${text(raw)}» no es válido.`;
      }
    }
    return null;
  }

  private totals(results: ProjectImportRowResult[]): ProjectImportTotals {
    const toCreate = results.filter((r) => r.outcome === 'CREATE');
    const students = toCreate.flatMap((r) => r.participants);
    return {
      rows: results.length,
      toCreate: toCreate.length,
      skipped: results.filter((r) => r.outcome === 'SKIP').length,
      errors: results.filter((r) => r.outcome === 'ERROR').length,
      participants: students.length,
      withoutAccount: students.filter((p) => p.status === 'NO_ACCOUNT').length,
    };
  }
}
