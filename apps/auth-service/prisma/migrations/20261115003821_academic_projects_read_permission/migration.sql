-- CU-86e3vmz0m
-- Read-only access of the academic roles to the projects in their scope.
--
-- read:academic_projects opens the gateway endpoints under /academic. Which projects each
-- caller sees is decided by project-service from four scope permissions (the union of the
-- ones the user holds):
--   read_all:academic_projects        every project                                  Admin, FacultyAdmin, Dean
--   read_tutored:academic_projects    the projects the user tutors                    Tutor
--   read_course:academic_projects     the projects of the user's course sections      Professor
--   read_department:academic_projects the projects of the course sections of the
--                                     department the user directs                     DepartmentDirector
-- Giving or removing a scope to a role is a row in _role_permissions; project-service fixes
-- no role id. Admin gets read_all explicitly: the Admin bypass of the gateway guard does not
-- reach project-service.
-- Grades not yet published stay hidden from Tutor, Professor and DepartmentDirector, which
-- do not hold read:grades.
-- Data only (no schema change); safe to run on a database that already has the grants.

INSERT INTO "public"."permissions" ("action", "resource", "description", "updated_at")
VALUES
    ('read', 'academic_projects', 'Open the academic read endpoints (projects, registrations and grades); the read_* scope permissions decide which projects', CURRENT_TIMESTAMP),
    ('read_all', 'academic_projects', 'Academic read scope: every project', CURRENT_TIMESTAMP),
    ('read_tutored', 'academic_projects', 'Academic read scope: the projects the user tutors', CURRENT_TIMESTAMP),
    ('read_course', 'academic_projects', 'Academic read scope: the projects of the course sections (NRC) the user teaches', CURRENT_TIMESTAMP),
    ('read_department', 'academic_projects', 'Academic read scope: the projects of the course sections of the department the user directs', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "public"."_role_permissions" ("A", "B")
SELECT permission."id", role."id"
FROM (VALUES
    ('Admin', 'read:academic_projects'), ('Admin', 'read_all:academic_projects'),
    ('FacultyAdmin', 'read:academic_projects'), ('FacultyAdmin', 'read_all:academic_projects'),
    ('Dean', 'read:academic_projects'), ('Dean', 'read_all:academic_projects'),
    ('Tutor', 'read:academic_projects'), ('Tutor', 'read_tutored:academic_projects'),
    ('Professor', 'read:academic_projects'), ('Professor', 'read_course:academic_projects'),
    ('DepartmentDirector', 'read:academic_projects'), ('DepartmentDirector', 'read_department:academic_projects')
) AS grant_row("role_name", "permission")
JOIN "public"."roles" role ON role."name" = grant_row."role_name"
JOIN "public"."permissions" permission
    ON permission."action" || ':' || permission."resource" = grant_row."permission"
ON CONFLICT ("A", "B") DO NOTHING;
