-- CU-1dfnv12d1wz
-- Permission for the administrative project endpoints (change log, and later state,
-- data, members, tutors and documents corrections). Granted to Admin and FacultyAdmin;
-- EventManager does not get it. Safe to run on any database: nothing is inserted twice.

INSERT INTO "public"."permissions" ("action", "resource", "description", "updated_at")
VALUES
    ('manage', 'projects', 'Correct projects and their state as an administrator, and read their change log', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "public"."_role_permissions" ("A", "B")
SELECT permission."id", role."id"
FROM (VALUES
    ('Admin', 'manage:projects'),
    ('FacultyAdmin', 'manage:projects')
) AS grant_row("role_name", "permission")
JOIN "public"."roles" role ON role."name" = grant_row."role_name"
JOIN "public"."permissions" permission
    ON permission."action" || ':' || permission."resource" = grant_row."permission"
ON CONFLICT ("A", "B") DO NOTHING;
