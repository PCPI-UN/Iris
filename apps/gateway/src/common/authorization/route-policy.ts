/**
 * Access policy of every gateway endpoint (CU-86e3vmxav, IRIS-V3-ROL-01).
 *
 * The guards read the decorators of each controller (`@Public()`, `@RequirePermission()`);
 * this table states what each endpoint is meant to require and `route-policy.spec.ts`
 * fails when a decorator and the table disagree, or when an endpoint is missing from it.
 * Changing who can call an endpoint means changing both, on purpose.
 *
 * - `public`: no session.
 * - `session`: any authenticated user; `why` says why that is enough (own data, or data
 *   that is not sensitive).
 * - `owner`: the guard only asks for a session and the service named in `why` checks that
 *   the caller owns the resource (participant of the project, assigned juror) or is staff.
 * - `permission`: the permission(s) required; roles that hold them are in the auth-service
 *   migrations (Admin passes every check).
 *
 * There is no "pending" value: every endpoint has a decision.
 */
export type RouteAccess =
  | { access: 'public' }
  | { access: 'session'; why: string }
  | { access: 'owner'; why: string }
  | { permission: string[] };

export const ROUTE_POLICY: Record<string, RouteAccess> = {
  // common/cache/cache-management.controller.ts
  'DELETE /admin/cache/clear-all': { permission: ['admin:system'] },
  'DELETE /admin/cache/endpoint': { permission: ['admin:system'] },
  'DELETE /admin/cache/event/:eventId': { permission: ['admin:system'] },
  'DELETE /admin/cache/pattern': { permission: ['admin:system'] },
  'GET /admin/cache/stats': { permission: ['admin:system'] },
  'DELETE /admin/cache/user/:userId': { permission: ['admin:system'] },
  // health.controller.ts
  'GET /health': { access: 'public' },
  // modules/academic/academic.controller.ts (read-only; project-service limits the scope)
  'GET /academic/events': { permission: ['read:academic_projects'] },
  'GET /academic/grades': { permission: ['read:academic_projects'] },
  'GET /academic/projects': { permission: ['read:academic_projects'] },
  'GET /academic/projects/:id': { permission: ['read:academic_projects'] },
  'GET /academic/registrations': { permission: ['read:academic_projects'] },
  // modules/auth/auth.controller.ts
  'POST /auth/activate': { access: 'public' },
  'GET /auth/callback': { access: 'public' },
  'POST /auth/forgot-password': { access: 'public' },
  'POST /auth/login': { access: 'public' },
  'GET /auth/login/microsoft': { access: 'public' },
  'POST /auth/logout': {
    access: 'session',
    why: "closes the caller's own session",
  },
  'GET /auth/me': { access: 'session', why: "the caller's own account" },
  'PUT /auth/password': {
    access: 'session',
    why: "changes the caller's own password; auth-service checks the current one",
  },
  'POST /auth/refresh': { access: 'public' },
  'POST /auth/reset-password': { access: 'public' },
  'POST /auth/signup': { access: 'public' },
  'GET /auth/validate-token': { access: 'public' },
  // modules/criterions/criterions.controller.ts
  'GET /criterions': { permission: ['read:events'] },
  'POST /criterions': { permission: ['manage:events'] },
  'DELETE /criterions/:id': { permission: ['manage:events'] },
  'GET /criterions/:id': { permission: ['read:events'] },
  'PUT /criterions/:id': { permission: ['manage:events'] },
  'GET /criterions/components': { permission: ['read:events'] },
  'POST /criterions/components': { permission: ['manage:events'] },
  'DELETE /criterions/components/:id': { permission: ['manage:events'] },
  'GET /criterions/components/:id': { permission: ['read:events'] },
  'PUT /criterions/components/:id': { permission: ['manage:events'] },
  'GET /criterions/course/:courseId': {
    access: 'session',
    why: 'rubric of a category, without grades; assigned jurors (platform role User) load it to evaluate',
  },
  'GET /criterions/readiness': { permission: ['manage:events'] },
  // modules/dashboard/dashboard.controller.ts
  'GET /dashboard/stats': { permission: ['read:events'] },
  // modules/diplomas/diplomas.controller.ts
  'GET /events/:eventId/my-project/diploma': {
    access: 'owner',
    why: "DiplomasService (gateway): diploma of the caller's own project, only once the results are published and if it won an award",
  },
  // modules/dashboard/student-dashboard.controller.ts
  'GET /students/me/dashboard': {
    access: 'session',
    why: "the caller's own dashboard; the user comes from the session",
  },
  // modules/dashboard/student-results.controller.ts
  'GET /events/:eventId/my-project/results': {
    access: 'session',
    why: "results of the caller's own project in the event, only once the admin publishes them",
  },
  // modules/evaluations/evaluations.controller.ts
  'GET /evaluations/courses/:courseId/top-projects': {
    permission: ['read:grades'],
  },
  'GET /evaluations/projects/:projectId/stats': { permission: ['read:grades'] },
  'POST /evaluations/projects/evaluate': {
    access: 'session',
    why: 'evaluation-service checks that the caller is a juror assigned to the project, evaluations are open and the event dates',
  },
  // modules/events/events.controller.ts
  'GET /events': { permission: ['read:events'] },
  'POST /events': { permission: ['manage:events'] },
  'GET /events/:eventId/jurors': { permission: ['read:event-members'] },
  'GET /events/:eventId/rankings': { permission: ['read:grades'] },
  'GET /events/:eventId/rankings/public': { access: 'public' },
  'DELETE /events/:id': { permission: ['manage:events'] },
  'GET /events/:id': { permission: ['read:events'] },
  'PATCH /events/:id': { permission: ['manage:events'] },
  'GET /events/:id/my-project': {
    access: 'session',
    why: "the caller's own project in the event",
  },
  'GET /events/ar': { access: 'public' },
  'GET /events/award-winners': { permission: ['read:grades'] },
  'POST /events/award-winners': { permission: ['manage:events'] },
  'DELETE /events/award-winners/:id': { permission: ['manage:events'] },
  'GET /events/award-winners/:id': { permission: ['read:grades'] },
  'PATCH /events/award-winners/:id': { permission: ['manage:events'] },
  'GET /events/categories': { permission: ['read:events'] },
  'POST /events/categories': { permission: ['manage:events'] },
  'DELETE /events/categories/:id': { permission: ['manage:events'] },
  'GET /events/categories/:id': { permission: ['read:events'] },
  'PATCH /events/categories/:id': { permission: ['manage:events'] },
  'GET /events/categories/event/:eventId': { permission: ['read:events'] },
  'GET /events/category-awards': { permission: ['read:events'] },
  'POST /events/category-awards': { permission: ['manage:events'] },
  'DELETE /events/category-awards/:id': { permission: ['manage:events'] },
  'GET /events/category-awards/:id': { permission: ['read:events'] },
  'PATCH /events/category-awards/:id': { permission: ['manage:events'] },
  'GET /events/courses': { permission: ['read:events'] },
  'POST /events/courses': { permission: ['create:event-members'] },
  'DELETE /events/courses/:id': { permission: ['delete:event-members'] },
  'GET /events/courses/:id': {
    access: 'session',
    why: 'one category of an event; the student project wizard needs it and the same data is public in /events/public/:id',
  },
  'PATCH /events/courses/:id': { permission: ['manage:events'] },
  'GET /events/courses/all': { permission: ['read:events'] },
  'GET /events/courses/dropdown/:eventId': { permission: ['read:events'] },
  'GET /events/courses/event/:eventId': {
    access: 'session',
    why: 'categories of an event; the student project wizard needs them and the same data is public in /events/public/:id',
  },
  'GET /events/dropdown': { permission: ['read:events'] },
  'GET /events/inscription-details': { permission: ['read:events'] },
  'POST /events/inscription-details': { permission: ['manage:events'] },
  'DELETE /events/inscription-details/:id': { permission: ['manage:events'] },
  'GET /events/inscription-details/:id': { permission: ['read:events'] },
  'PATCH /events/inscription-details/:id': { permission: ['manage:events'] },
  'POST /events/members': { permission: ['create:event-members'] },
  'GET /events/members/:eventId': { permission: ['read:event-members'] },
  'DELETE /events/members/delete': { permission: ['delete:event-members'] },
  'GET /events/my-events': {
    access: 'session',
    why: 'events of the caller; platform staff (read:events) sees every event',
  },
  'GET /events/public': { access: 'public' },
  'GET /events/public/:id': { access: 'public' },
  'GET /events/public/past': { access: 'public' },
  'GET /events/public/past/:id': { access: 'public' },
  'GET /events/public/winners': { access: 'public' },
  'POST /events/ranking-config': { permission: ['manage:events'] },
  'DELETE /events/ranking-config/:id': { permission: ['manage:events'] },
  'GET /events/ranking-config/:id': { permission: ['read:events'] },
  'GET /events/ranking-config/by-event/:eventId': { access: 'public' },
  'GET /events/recaps': { permission: ['read:events'] },
  'POST /events/recaps': { permission: ['manage:events'] },
  'DELETE /events/recaps/:id': { permission: ['manage:events'] },
  'GET /events/recaps/:id': { permission: ['read:events'] },
  'PATCH /events/recaps/:id': { permission: ['manage:events'] },
  'GET /events/statuses': { access: 'public' },
  'PATCH /events/update-ranking-config/:id': { permission: ['manage:events'] },
  // modules/grading-scales/grading-scales.controller.ts
  'GET /grading-scales': { permission: ['read:events'] },
  'POST /grading-scales': { permission: ['manage:events'] },
  'DELETE /grading-scales/:id': { permission: ['manage:events'] },
  'GET /grading-scales/:id': { permission: ['read:events'] },
  'PUT /grading-scales/:id': { permission: ['manage:events'] },
  // modules/invitations/invitations.controller.ts
  'POST /invitations': {
    access: 'owner',
    why: 'invitation-service AuthorizeInvitation: PLATFORM needs create:invitations and a grant auth-service allows (Admin/FacultyAdmin only with manage:admins, never to oneself); EVENT needs manage:events; PROJECT/PROJECT_TUTOR need a participant of the project or manage:events and only give Participant/Tutor',
  },
  'POST /invitations/:invitationId/resend': { permission: ['manage:events'] },
  'GET /invitations/:token': { access: 'public' },
  'POST /invitations/accept': { access: 'public' },
  'GET /invitations/events/:eventId': { permission: ['read:invitations'] },
  'POST /invitations/events/:eventId/jurors': { permission: ['manage:events'] },
  'GET /invitations/me': {
    access: 'session',
    why: 'invitations addressed to the caller',
  },
  // modules/profile/profile.controller.ts
  'GET /profile/me': {
    access: 'session',
    why: "the caller's own profile; the user id comes from the session",
  },
  'PATCH /profile/me': {
    access: 'session',
    why: "edits the caller's own profile; auth-service only accepts the editable fields",
  },
  // modules/projects/juror-imports/juror-imports.controller.ts
  'POST /events/:eventId/juror-imports/preview': {
    permission: ['manage:events'],
  },
  'POST /events/:eventId/juror-imports/execute': {
    permission: ['manage:events'],
  },
  'GET /events/:eventId/juror-imports/template': {
    permission: ['manage:events'],
  },
  // modules/projects/projects.controller.ts
  'POST /projects': { access: 'public' },
  'GET /projects/:id': {
    access: 'owner',
    why: 'project-service CheckProjectAccess READ: participants, assigned jurors or read:events',
  },
  'PATCH /projects/:id/approve': { permission: ['manage:events'] },
  'POST /projects/:id/change-to-under-review': {
    access: 'owner',
    why: 'project-service requires a confirmed participant and the REQUEST_CHANGES state',
  },
  'PATCH /projects/:id/code': {
    access: 'owner',
    why: 'the gateway use case requires a confirmed participant and the REQUEST_CHANGES state',
  },
  'GET /projects/:id/for-review': {
    access: 'owner',
    why: 'project-service CheckProjectAccess READ: participants, assigned jurors or read:events',
  },
  'PATCH /projects/:id/info': {
    access: 'owner',
    why: 'project-service CheckProjectAccess EDIT: participants or manage:events',
  },
  'GET /projects/:id/jurors': { permission: ['read:event-members'] },
  'PATCH /projects/:id/reject': { permission: ['manage:events'] },
  'PATCH /projects/:id/request-changes': { permission: ['manage:events'] },
  'POST /projects/:projectId/documents': { access: 'public' },
  'GET /projects/:projectId/documents/:documentId/open': { access: 'public' },
  'DELETE /projects/:projectId/jurors/:jurorId': { permission: ['manage:events'] },
  'POST /projects/add-update-participants': {
    access: 'owner',
    why: 'project-service CheckProjectAccess EDIT on the projectId of the body: participants or manage:events',
  },
  'POST /projects/assign-jurors': { permission: ['manage:events'] },
  'GET /projects/assigned-projects': {
    access: 'session',
    why: 'projects assigned to the calling juror',
  },
  // name search for the public submission form; returns id and name only
  'GET /projects/tutor-candidates': { access: 'public' },
  'PUT /projects/:id/tutors': { permission: ['manage:events'] },
  'GET /projects/by-event/:eventId': { access: 'public' },
  'GET /projects/by-event/:eventId/with-jurors': { access: 'public' },
  'PATCH /projects/documents/:id': {
    access: 'owner',
    why: 'project-service CheckProjectAccess EDIT on the project of the document, before the file is uploaded: participants or manage:events',
  },
  'PATCH /projects/reassign-juror': { permission: ['manage:events'] },
  // modules/reports/reports.controller.ts
  'GET /events/:eventId/my-project/report': {
    access: 'owner',
    why: "EvaluationReportService (gateway): report of the caller's own project, only once the admin publishes the results",
  },
  'GET /events/:eventId/reports/evaluation': {
    access: 'owner',
    why: 'EvaluationReportService (gateway) checks read:grades (whole category) or read:academic_projects (only the projects in scope, once published); anyone else gets 403',
  },
  // modules/terms/terms.controller.ts
  'GET /terms': { permission: ['read:events'] },
  'POST /terms': { permission: ['manage:events'] },
  // modules/tiebreaks/tiebreaks.controller.ts
  'GET /tiebreaks': { permission: ['read:grades'] },
  'POST /tiebreaks': { permission: ['manage:events'] },
  'DELETE /tiebreaks/:id': { permission: ['manage:events'] },
  'GET /tiebreaks/:id': { permission: ['read:grades'] },
  'PUT /tiebreaks/:id': { permission: ['manage:events'] },
  // modules/users/users.controller.ts
  'GET /users': { permission: ['read:users'] },
  'POST /users': { permission: ['create:users'] },
  'DELETE /users/:id': { permission: ['delete:users'] },
  'GET /users/:id': { permission: ['read:users'] },
  'PATCH /users/:id': { permission: ['update:users'] },
  'PUT /users/:id/roles': { permission: ['manage:user_roles'] },
  'GET /users/roles': { permission: ['read:users'] },
};
