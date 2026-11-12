-- CU-86e3vmxav / IRIS-V3-ROL-01, IRIS-V3-ADM-02
-- Role and permission catalogue, now kept in migrations instead of the seed.
--
-- The seed skipped everything once any role existed, so new roles never reached a
-- database that was already seeded (production). This migration creates the whole
-- catalogue and is safe on both kinds of database:
--   * existing database: the 5 original roles and their grants are left as they are;
--     only the new permissions, roles and grants are added;
--   * new database: everything is created here, and the original roles keep their ids
--     (User = 3 and Juror = 4 are used as fixed ids by signup and project-service).

-- 1. Permissions --------------------------------------------------------------------

INSERT INTO "public"."permissions" ("action", "resource", "description", "updated_at")
VALUES
    -- Platform permissions of the original seed
    ('create', 'users', 'Create new user accounts', CURRENT_TIMESTAMP),
    ('read', 'users', 'View user information', CURRENT_TIMESTAMP),
    ('update', 'users', 'Modify user profiles', CURRENT_TIMESTAMP),
    ('delete', 'users', 'Deactivate user accounts', CURRENT_TIMESTAMP),
    ('manage', 'user_roles', 'Assign/remove platform roles', CURRENT_TIMESTAMP),
    ('create', 'invitations', 'Create platform/event/project invitations', CURRENT_TIMESTAMP),
    ('read', 'invitations', 'View invitation details', CURRENT_TIMESTAMP),
    ('accept', 'invitations', 'Accept invitations (USER)', CURRENT_TIMESTAMP),
    ('manage', 'events', 'Full event management (CRUD)', CURRENT_TIMESTAMP),
    ('read', 'events', 'View event information', CURRENT_TIMESTAMP),
    ('create', 'events', 'Create new events', CURRENT_TIMESTAMP),
    ('update', 'events', 'Modify event details', CURRENT_TIMESTAMP),
    ('delete', 'events', 'Delete events', CURRENT_TIMESTAMP),
    ('manage', 'all_events', 'Bypass event membership checks (admin override)', CURRENT_TIMESTAMP),
    ('view', 'public_events', 'View public events (USER)', CURRENT_TIMESTAMP),
    ('manage', 'courses', 'Manage courses within events', CURRENT_TIMESTAMP),
    ('manage', 'own_profile', 'Manage own user profile (USER)', CURRENT_TIMESTAMP),
    ('view', 'own_data', 'View own user data (USER)', CURRENT_TIMESTAMP),
    -- Event permissions of the original seed
    ('read', 'event_members', 'View event member list', CURRENT_TIMESTAMP),
    ('read', 'event_projects', 'View projects in event', CURRENT_TIMESTAMP),
    ('read', 'event_info', 'View basic event information', CURRENT_TIMESTAMP),
    ('evaluate', 'projects', 'Submit evaluations for assigned projects', CURRENT_TIMESTAMP),
    ('read', 'evaluations', 'View evaluations', CURRENT_TIMESTAMP),
    ('submit', 'projects', 'Submit projects to event', CURRENT_TIMESTAMP),
    ('update', 'own_project', 'Modify own submitted project', CURRENT_TIMESTAMP),
    -- New
    ('read', 'grades', 'View grades, rankings and evaluation results of any event, published or not', CURRENT_TIMESTAMP),
    ('manage', 'admins', 'Create, modify, deactivate and change the roles of administrator accounts', CURRENT_TIMESTAMP),
    -- Required by gateway endpoints but missing from the seed (only Admin could use them)
    ('create', 'event-members', 'Create event categories (courses) and add event members', CURRENT_TIMESTAMP),
    ('read', 'event-members', 'View the members and jurors of an event', CURRENT_TIMESTAMP),
    ('delete', 'event-members', 'Delete event categories (courses) and remove event members', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

-- 2. Roles (fixed ids) -------------------------------------------------------------

INSERT INTO "public"."roles" ("id", "name", "scope", "description", "updated_at")
SELECT role."id", role."name", role."scope", role."description", CURRENT_TIMESTAMP
FROM (VALUES
    (1, 'Admin', 'PLATFORM', 'Full system administrator with all permissions'),
    (2, 'EventManager', 'PLATFORM', 'User responsible for creating and managing events'),
    (3, 'User', 'PLATFORM', 'Regular authenticated user with basic platform permissions'),
    (4, 'Juror', 'EVENT', 'Event member who evaluates assigned projects'),
    (5, 'Participant', 'EVENT', 'Event member who can submit projects'),
    (6, 'FacultyAdmin', 'PLATFORM', 'Faculty (decanatura) administrator: every administrative operation except managing administrators'),
    (7, 'Dean', 'PLATFORM', 'Dean: read-only access to everything, including grades before publication'),
    (8, 'DepartmentDirector', 'PLATFORM', 'Department director: read-only access to the projects of the department'),
    (9, 'Professor', 'PLATFORM', 'Professor of a final project course: read-only access to the projects of the course'),
    (10, 'Tutor', 'PLATFORM', 'Project tutor: read-only access to the tutored projects')
) AS role("id", "name", "scope", "description")
WHERE NOT EXISTS (SELECT 1 FROM "public"."roles" existing WHERE existing."name" = role."name");

-- Next roles created without an explicit id continue after the fixed ones
SELECT setval(pg_get_serial_sequence('"public"."roles"', 'id'), (SELECT MAX("id") FROM "public"."roles"));

-- 3. Grants (role name, permission) ---------------------------------------------------

INSERT INTO "public"."_role_permissions" ("A", "B")
SELECT permission."id", role."id"
FROM (VALUES
    -- Admin: every platform permission (it also bypasses every check by name)
    ('Admin', 'create:users'), ('Admin', 'read:users'), ('Admin', 'update:users'), ('Admin', 'delete:users'),
    ('Admin', 'manage:user_roles'), ('Admin', 'create:invitations'), ('Admin', 'read:invitations'),
    ('Admin', 'accept:invitations'), ('Admin', 'manage:events'), ('Admin', 'read:events'),
    ('Admin', 'create:events'), ('Admin', 'update:events'), ('Admin', 'delete:events'),
    ('Admin', 'manage:all_events'), ('Admin', 'view:public_events'), ('Admin', 'manage:courses'),
    ('Admin', 'manage:own_profile'), ('Admin', 'view:own_data'),
    ('Admin', 'read:grades'), ('Admin', 'manage:admins'),
    ('Admin', 'create:event-members'), ('Admin', 'read:event-members'), ('Admin', 'delete:event-members'),

    -- EventManager: as in the original seed, plus read:grades to keep reading rankings,
    -- which required manage:events before, and the event-members permissions that the
    -- course and event member endpoints require
    ('EventManager', 'view:public_events'), ('EventManager', 'accept:invitations'),
    ('EventManager', 'manage:own_profile'), ('EventManager', 'view:own_data'), ('EventManager', 'read:users'),
    ('EventManager', 'create:invitations'), ('EventManager', 'read:invitations'),
    ('EventManager', 'manage:events'), ('EventManager', 'read:events'), ('EventManager', 'create:events'),
    ('EventManager', 'update:events'), ('EventManager', 'delete:events'), ('EventManager', 'manage:courses'),
    ('EventManager', 'read:grades'),
    ('EventManager', 'create:event-members'), ('EventManager', 'read:event-members'),
    ('EventManager', 'delete:event-members'),

    -- User (student and anyone who signs up)
    ('User', 'view:public_events'), ('User', 'accept:invitations'), ('User', 'manage:own_profile'), ('User', 'view:own_data'),

    -- Event roles
    ('Juror', 'read:event_members'), ('Juror', 'read:event_projects'), ('Juror', 'read:event_info'),
    ('Juror', 'evaluate:projects'), ('Juror', 'read:evaluations'),
    ('Participant', 'read:event_members'), ('Participant', 'read:event_projects'), ('Participant', 'read:event_info'),
    ('Participant', 'submit:projects'), ('Participant', 'update:own_project'),

    -- FacultyAdmin: what Admin can do except manage:admins (and the admin:system cache tools,
    -- which only the Admin bypass reaches)
    ('FacultyAdmin', 'create:users'), ('FacultyAdmin', 'read:users'), ('FacultyAdmin', 'update:users'),
    ('FacultyAdmin', 'delete:users'), ('FacultyAdmin', 'manage:user_roles'), ('FacultyAdmin', 'create:invitations'),
    ('FacultyAdmin', 'read:invitations'), ('FacultyAdmin', 'accept:invitations'), ('FacultyAdmin', 'manage:events'),
    ('FacultyAdmin', 'read:events'), ('FacultyAdmin', 'create:events'), ('FacultyAdmin', 'update:events'),
    ('FacultyAdmin', 'delete:events'), ('FacultyAdmin', 'manage:all_events'), ('FacultyAdmin', 'view:public_events'),
    ('FacultyAdmin', 'manage:courses'), ('FacultyAdmin', 'manage:own_profile'), ('FacultyAdmin', 'view:own_data'),
    ('FacultyAdmin', 'read:grades'),
    ('FacultyAdmin', 'create:event-members'), ('FacultyAdmin', 'read:event-members'), ('FacultyAdmin', 'delete:event-members'),

    -- Dean: read-only access to everything, grades included before publication
    ('Dean', 'view:public_events'), ('Dean', 'accept:invitations'), ('Dean', 'manage:own_profile'), ('Dean', 'view:own_data'),
    ('Dean', 'read:users'), ('Dean', 'read:invitations'), ('Dean', 'read:events'), ('Dean', 'read:grades'),
    ('Dean', 'read:event-members'),

    -- Academic profiles: same as User until the endpoints scoped to their course, tutored
    -- projects or department exist (Sprint 2)
    ('DepartmentDirector', 'view:public_events'), ('DepartmentDirector', 'accept:invitations'),
    ('DepartmentDirector', 'manage:own_profile'), ('DepartmentDirector', 'view:own_data'),
    ('Professor', 'view:public_events'), ('Professor', 'accept:invitations'),
    ('Professor', 'manage:own_profile'), ('Professor', 'view:own_data'),
    ('Tutor', 'view:public_events'), ('Tutor', 'accept:invitations'),
    ('Tutor', 'manage:own_profile'), ('Tutor', 'view:own_data')
) AS grant_row("role_name", "permission")
JOIN "public"."roles" role ON role."name" = grant_row."role_name"
JOIN "public"."permissions" permission
    ON permission."action" || ':' || permission."resource" = grant_row."permission"
ON CONFLICT ("A", "B") DO NOTHING;
