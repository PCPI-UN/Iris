-- CU-86e3vmz0m
-- Read-only access of the academic roles to the projects in their scope.
--
-- read:academic_projects opens the gateway endpoints under /academic. The projects each
-- caller sees are decided by project-service from their roles: Admin, FacultyAdmin and
-- Dean read every project; Tutor, Professor and DepartmentDirector only the ones they
-- tutor, teach (course section) or direct (department). Grades not yet published stay
-- hidden from the last three, which do not hold read:grades.
-- Data only (no schema change); safe to run on a database that already has the grant.

INSERT INTO "public"."permissions" ("action", "resource", "description", "updated_at")
VALUES ('read', 'academic_projects', 'View the projects, registrations and grades of the projects in the user''s academic scope', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "public"."_role_permissions" ("A", "B")
SELECT permission."id", role."id"
FROM "public"."roles" role
JOIN "public"."permissions" permission
    ON permission."action" = 'read' AND permission."resource" = 'academic_projects'
WHERE role."name" IN ('Admin', 'FacultyAdmin', 'Dean', 'DepartmentDirector', 'Professor', 'Tutor')
ON CONFLICT ("A", "B") DO NOTHING;
