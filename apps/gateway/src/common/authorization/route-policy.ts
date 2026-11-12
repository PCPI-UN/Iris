/**
 * Access policy of every gateway endpoint (CU-86e3vmxav, IRIS-V3-ROL-01).
 *
 * The guards read the decorators of each controller (`@Public()`, `@RequirePermission()`);
 * this table states what each endpoint is meant to require and `route-policy.spec.ts`
 * fails when a decorator and the table disagree, or when an endpoint is missing from it.
 * Changing who can call an endpoint means changing both, on purpose.
 *
 * - `public`: no session.
 * - `session`: any authenticated user; `why` says why that is enough (own data, or the
 *   service behind checks ownership).
 * - `pending`: only a session today, without a decision yet. They are reviewed one by one
 *   in the task "Seguridad - Exigir permiso en los endpoints que escriben y solo piden
 *   sesión" (ClickUp 1dfnv12c650); a `pending` endpoint must end as `permission` or `session`.
 * - `permission`: the permission(s) required; roles that hold them are in the auth-service
 *   migrations (Admin passes every check).
 */
export type RouteAccess =
  | { access: 'public' }
  | { access: 'session'; why: string }
  | { access: 'pending' }
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
  'GET /criterions/course/:courseId': { access: 'pending' },
  'GET /criterions/readiness': { permission: ['manage:events'] },
  // modules/dashboard/dashboard.controller.ts
  'GET /dashboard/stats': { permission: ['read:events'] },
  // modules/evaluations/evaluations.controller.ts
  'GET /evaluations/courses/:courseId/top-projects': {
    permission: ['read:grades'],
  },
  'GET /evaluations/projects/:projectId/stats': { access: 'pending' },
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
  'GET /events/award-winners': { access: 'pending' },
  'POST /events/award-winners': { access: 'pending' },
  'DELETE /events/award-winners/:id': { access: 'pending' },
  'GET /events/award-winners/:id': { access: 'pending' },
  'PATCH /events/award-winners/:id': { access: 'pending' },
  'GET /events/categories': { access: 'pending' },
  'POST /events/categories': { access: 'pending' },
  'DELETE /events/categories/:id': { access: 'pending' },
  'GET /events/categories/:id': { access: 'pending' },
  'PATCH /events/categories/:id': { access: 'pending' },
  'GET /events/categories/event/:eventId': { access: 'pending' },
  'GET /events/category-awards': { access: 'pending' },
  'POST /events/category-awards': { access: 'pending' },
  'DELETE /events/category-awards/:id': { access: 'pending' },
  'GET /events/category-awards/:id': { access: 'pending' },
  'PATCH /events/category-awards/:id': { access: 'pending' },
  'GET /events/courses': { access: 'pending' },
  'POST /events/courses': { permission: ['create:event-members'] },
  'DELETE /events/courses/:id': { permission: ['delete:event-members'] },
  'GET /events/courses/:id': { access: 'pending' },
  'PATCH /events/courses/:id': { access: 'pending' },
  'GET /events/courses/all': { access: 'pending' },
  'GET /events/courses/dropdown/:eventId': { access: 'pending' },
  'GET /events/courses/event/:eventId': { access: 'pending' },
  'GET /events/dropdown': { permission: ['read:events'] },
  'GET /events/inscription-details': { access: 'pending' },
  'POST /events/inscription-details': { access: 'pending' },
  'DELETE /events/inscription-details/:id': { access: 'pending' },
  'GET /events/inscription-details/:id': { access: 'pending' },
  'PATCH /events/inscription-details/:id': { access: 'pending' },
  'POST /events/members': { permission: ['create:event-members'] },
  'GET /events/members/:eventId': { access: 'public' },
  'DELETE /events/members/delete': { access: 'public' },
  'GET /events/my-events': {
    access: 'session',
    why: 'events of the caller; platform staff (read:events) sees every event',
  },
  'GET /events/public': { access: 'public' },
  'GET /events/public/:id': { access: 'public' },
  'GET /events/public/past': { access: 'public' },
  'GET /events/public/past/:id': { access: 'public' },
  'POST /events/ranking-config': { permission: ['manage:events'] },
  'DELETE /events/ranking-config/:id': { permission: ['manage:events'] },
  'GET /events/ranking-config/:id': { permission: ['read:events'] },
  'GET /events/ranking-config/by-event/:eventId': { access: 'public' },
  'GET /events/recaps': { access: 'pending' },
  'POST /events/recaps': { access: 'pending' },
  'DELETE /events/recaps/:id': { access: 'pending' },
  'GET /events/recaps/:id': { access: 'pending' },
  'PATCH /events/recaps/:id': { access: 'pending' },
  'GET /events/statuses': { access: 'public' },
  'PATCH /events/update-ranking-config/:id': { permission: ['manage:events'] },
  // modules/invitations/invitations.controller.ts
  'POST /invitations': { access: 'pending' },
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
  // modules/projects/projects.controller.ts
  'POST /projects': { access: 'public' },
  'GET /projects/:id': { access: 'pending' },
  'PATCH /projects/:id/approve': { access: 'pending' },
  'POST /projects/:id/change-to-under-review': { access: 'pending' },
  'PATCH /projects/:id/code': { access: 'pending' },
  'GET /projects/:id/for-review': { access: 'pending' },
  'PATCH /projects/:id/info': { access: 'pending' },
  'GET /projects/:id/jurors': { access: 'pending' },
  'PATCH /projects/:id/reject': { access: 'pending' },
  'PATCH /projects/:id/request-changes': { access: 'pending' },
  'POST /projects/:projectId/documents': { access: 'public' },
  'GET /projects/:projectId/documents/:documentId/open': { access: 'public' },
  'DELETE /projects/:projectId/jurors/:jurorId': { access: 'pending' },
  'POST /projects/add-update-participants': { access: 'pending' },
  'POST /projects/assign-jurors': { access: 'pending' },
  'GET /projects/assigned-projects': {
    access: 'session',
    why: 'projects assigned to the calling juror',
  },
  'GET /projects/by-event/:eventId': { access: 'public' },
  'GET /projects/by-event/:eventId/with-jurors': { access: 'public' },
  'PATCH /projects/documents/:id': { access: 'pending' },
  'PATCH /projects/reassign-juror': { access: 'pending' },
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
