-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "academic_course_id" INTEGER;

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
CREATE TABLE "academic_courses" (
    "id" SERIAL NOT NULL,
    "nrc" VARCHAR(20) NOT NULL,
    "term" VARCHAR(20) NOT NULL,
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
CREATE UNIQUE INDEX "academic_courses_term_nrc_key" ON "academic_courses"("term", "nrc");

-- CreateIndex
CREATE INDEX "projects_academic_course_id_idx" ON "projects"("academic_course_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_academic_course_id_fkey" FOREIGN KEY ("academic_course_id") REFERENCES "academic_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_courses" ADD CONSTRAINT "academic_courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

