-- CU-86e3vmz0m
-- Departments and course sections (NRC per academic term). They decide which projects a
-- Professor (their course sections) and a DepartmentDirector (the course sections of their
-- department) can read. Every project belongs to one course section: a real one, 0 when its
-- event is not course work, or -1 when it was created before course sections existed.

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "director_user_id" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- term_id is an event-service term and professor_user_id an auth-service user: other
-- databases, so neither has a foreign key
CREATE TABLE "academic_courses" (
    "id" SERIAL NOT NULL,
    "nrc" VARCHAR(20) NOT NULL,
    "term_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "professor_user_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "academic_courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_director_user_id_key" ON "departments"("director_user_id");

-- CreateIndex
CREATE INDEX "academic_courses_professor_user_id_idx" ON "academic_courses"("professor_user_id");

-- CreateIndex
CREATE INDEX "academic_courses_department_id_idx" ON "academic_courses"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_courses_term_id_nrc_key" ON "academic_courses"("term_id", "nrc");

-- AddForeignKey
ALTER TABLE "academic_courses" ADD CONSTRAINT "academic_courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fill rows. Their explicit ids leave the sequences untouched, so the real rows start at 1.
-- * Department -1 has no director, and holds both fill course sections.
-- * Course section -1 ("we do not know its course"): the projects created before course
--   sections existed.
-- * Course section 0 ("it has no course"): the projects of an event that does not require one
--   (event-service events.requires_course = false), such as a hackathon. create-project only
--   allows it for such an event: the rule crosses to the event-service database, so no
--   constraint here can enforce it.
-- Both are in term -1 (event-service "no term") and have professor 0: no user has id 0, while
-- a real id would make that user the professor of all those projects.
INSERT INTO "departments" ("id", "name", "director_user_id", "updated_at")
VALUES (-1, 'Sin departamento', NULL, CURRENT_TIMESTAMP);

INSERT INTO "academic_courses" ("id", "nrc", "term_id", "name", "professor_user_id", "department_id", "updated_at")
VALUES
    (-1, '-1', -1, 'Sin NRC', 0, -1, CURRENT_TIMESTAMP),
    (0, '0', -1, 'No aplica', 0, -1, CURRENT_TIMESTAMP);

-- AlterTable: fill the existing projects with course section -1, then require the column
ALTER TABLE "projects" ADD COLUMN "academic_course_id" INTEGER;

UPDATE "projects" SET "academic_course_id" = -1;

ALTER TABLE "projects" ALTER COLUMN "academic_course_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "projects_academic_course_id_idx" ON "projects"("academic_course_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_academic_course_id_fkey" FOREIGN KEY ("academic_course_id") REFERENCES "academic_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
