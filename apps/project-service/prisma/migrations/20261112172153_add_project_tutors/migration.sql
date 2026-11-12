-- CreateTable
CREATE TABLE "project_tutors" (
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_tutors_pkey" PRIMARY KEY ("project_id","user_id")
);
-- CreateTable
CREATE TABLE "pending_project_tutors" (
    "pending_id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "email" VARCHAR(255) NOT NULL,
    "status" "PendingParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "invited_at" TIMESTAMP,
    "joined_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    CONSTRAINT "pending_project_tutors_pkey" PRIMARY KEY ("pending_id")
);
-- CreateIndex
CREATE UNIQUE INDEX "pending_project_tutors_project_id_email_key" ON "pending_project_tutors"("project_id", "email");
-- AddForeignKey
ALTER TABLE "project_tutors" ADD CONSTRAINT "project_tutors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "pending_project_tutors" ADD CONSTRAINT "pending_project_tutors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
