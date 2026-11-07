import { TypedDocument ,ProjectState, ProjectDocument, Project, JurorKey, Status } from '../../domain/entities/project.entity';
import {
  JurorImportOutcome as ProtoJurorImportOutcome,
  JurorImportUserStatus as ProtoJurorImportUserStatus,
  PreviewJurorImportResponse,
  GetJurorImportTemplateResponse,
} from '@app/common/generated/project';
import {
  JurorImportOutcome,
  JurorImportPreview,
  JurorImportUserStatus,
} from '../../application/use-cases/preview-juror-import.uc';
import { JurorImportTemplate } from '../../application/use-cases/get-juror-import-template.uc';

// Mapear enum de dominio a enum del proto (numérico)
const stateToProto = (s: ProjectState): number => {
  switch (s) {
    case 'UNDER_REVIEW':    return 1;
    case 'APPROVED':        return 2;
    case 'REJECTED':        return 3;
    case 'REQUEST_CHANGES': return 4;
    default:                return 0; // UNSPECIFIED
  }
};

// Y viceversa (proto -> dominio) si recibes en CreateProject
export const protoToState = (n?: number): ProjectState => {
  switch (n) {
    case 1: return 'UNDER_REVIEW';
    case 2: return 'APPROVED';
    case 3: return 'REJECTED';
    case 4: return 'REQUEST_CHANGES'
    default: return 'UNDER_REVIEW';
  }
};

const TypedDocumentToProto = (t: TypedDocument): number => {
  switch (t) {
    case 'LOGO': return 1;
    case 'POSTER': return 2;
    case 'SUPPORTING_DOCUMENT': return 3;
    default: return 0; // UNSPECIFIED
  }
};
export const protoToTypedDocument = (n?: number): TypedDocument => {
  switch (n) {
    case 1: return 'LOGO';
    case 2: return 'POSTER';
    case 3: return 'SUPPORTING_DOCUMENT';
    default: return 'POSTER';
  }
};


const statusToProto = (s: any): number => {
  switch (s) {
    case 'PENDING': return 1;
    case 'INVITED': return 2;
    case 'JOINED':  return 3;
    default:        return 0; // UNSPECIFIED
  }
};

export const protoToStatus = (n?: number): any => {
  switch (n) {
    case 1: return 'PENDING';
    case 2: return 'INVITED';
    case 3: return 'JOINED';
    default: return 'PENDING';
  }
};

const documentStatusToProto = (s: any): number => {
  switch (s) {
    case 'ACTIVE': return 1;
    case 'INACTIVE': return 2;
    default:        return 0; // DOCUMENT_STATUS_UNSPECIFIED
  }
};

export const protoToDocumentStatus = (n?: number): any => {
  switch (n) {
    case 1: return 'ACTIVE';
    case 2: return 'INACTIVE';
    default: return 'ACTIVE';
  }
};

export const toProtoProject = (p: any) => ({
  id: p.id,
  eventId: p.eventId ?? p.event_id,
  courseId: p.courseId ?? p.course_id,              
  name: p.name,
  projectCode: p.projectCode ?? p.project_code ?? undefined,
  description: p.description ?? undefined,
  eventNumber: p.eventNumber ?? p.event_number ?? undefined,
  state: stateToProto(p.state as ProjectState),
  reason: p.reason ?? p.reason ?? undefined,      
  createdAt: p.createdAt?.toISOString?.() ?? p.created_at,
  updatedAt: p.updatedAt?.toISOString?.() ?? p.updated_at,
});

export const toProtoDocument = (d: any) => ({
  id: d.id,
  projectId: d.projectId ?? d.project_id,
  url: d.url,
  type: TypedDocumentToProto(d.type as TypedDocument),
  createdAt: d.createdAt?.toISOString?.() ?? d.created_at,
  updatedAt: d.updatedAt?.toISOString?.() ?? d.updated_at,
  state: documentStatusToProto(d.state as Status),
});

export const protoToJurorKey = (jk: any): JurorKey => ({
  memberUserId: jk.memberUserId,
  memberEventId: jk.memberEventId,
  memberRoleId: jk.memberRoleId,
});

export const toProtoParticipant = (p: any) => ({
  userId: p.userId,
  projectId: p.projectId,
  studentCode: p.studentCode, 
  firstName: p.firstName ?? undefined,
  lastName: p.lastName ?? undefined,
  email: p.email ?? undefined,
  semester: p.semester ?? undefined,
  career: p.career ?? undefined,
  status: statusToProto(p.status),
});

export const toProtoPendingParticipant = (p: any) => ({
  pendingId: p.pendingId,
  projectId: p.projectId,
  firstName: p.firstName,
  lastName: p.lastName ?? '',
  email: p.email,
  studentCode: p.studentCode,
  semester: p.semester,
  career: p.career,
  status: statusToProto(p.status),
  invitedAt: p.invitedAt?.toISOString?.() ?? p.invited_at,
  joinedAt: p.joinedAt?.toISOString?.() ?? p.joined_at,
  createdAt: p.createdAt?.toISOString?.() ?? p.created_at,
  updatedAt: p.updatedAt?.toISOString?.() ?? p.updated_at,
});
export const toProtoProjectComplete = (p: any) => ({
  ...toProtoProject(p),
  participants: (p.participants ?? []).map(toProtoParticipant),
  documents: (p.documents ?? []).map(toProtoDocument),
  pendingParticipants: (p.pendingParticipants ?? []).map(toProtoPendingParticipant),
});

const jurorImportOutcomeToProto: Record<
  JurorImportOutcome,
  ProtoJurorImportOutcome
> = {
  ASSIGN: ProtoJurorImportOutcome.ASSIGN,
  SKIP: ProtoJurorImportOutcome.SKIP,
  ERROR: ProtoJurorImportOutcome.ERROR,
};

const jurorImportUserStatusToProto: Record<
  JurorImportUserStatus,
  ProtoJurorImportUserStatus
> = {
  NEW_USER: ProtoJurorImportUserStatus.NEW_USER,
  EVENT_JUROR: ProtoJurorImportUserStatus.EVENT_JUROR,
  INVITE_TO_EVENT: ProtoJurorImportUserStatus.INVITE_TO_EVENT,
};

export const toPreviewJurorImportResponse = (
  preview: JurorImportPreview,
): PreviewJurorImportResponse => ({
  rows: preview.rows.map((row) => ({
    rowNumber: row.rowNumber,
    outcome: jurorImportOutcomeToProto[row.outcome],
    userStatus: row.userStatus
      ? jurorImportUserStatusToProto[row.userStatus]
      : ProtoJurorImportUserStatus.JUROR_IMPORT_USER_STATUS_UNSPECIFIED,
    message: row.message,
    email: row.email,
    projectId: row.projectId,
    projectName: row.projectName,
    userId: row.userId,
  })),
  totals: preview.totals,
  eventWarnings: preview.eventWarnings,
  canConfirm: preview.canConfirm,
});

export const toGetJurorImportTemplateResponse = (
  template: JurorImportTemplate,
): GetJurorImportTemplateResponse => ({
  eventName: template.eventName,
  departments: template.departments,
  projects: template.projects,
});
