-- CreateEnum
CREATE TYPE "ProjectChangeAction" AS ENUM ('STATE', 'INFO', 'CATEGORY', 'PARTICIPANTS', 'TUTORS', 'DOCUMENTS');

-- CreateTable
CREATE TABLE "project_change_log" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "action" "ProjectChangeAction" NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_change_log_project_id_created_at_idx" ON "project_change_log"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "project_change_log" ADD CONSTRAINT "project_change_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

