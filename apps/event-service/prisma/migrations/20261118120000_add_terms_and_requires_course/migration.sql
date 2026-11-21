-- CU-86e3vmz0m
-- Academic terms. The NRC of a course section repeats across terms, so project-service
-- needs the term of the event to resolve the NRC a student types to a single section.
-- Every event belongs to one term, and says whether its projects need a course section.

-- CreateTable
CREATE TABLE "terms" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_year_period_key" ON "terms"("year", "period");

-- Row -1 "no term": holds the events created before terms existed. The API neither lists
-- it nor lets an event be created or edited with it. Its explicit id leaves the sequence
-- untouched, so the real terms start at 1.
INSERT INTO "terms" ("id", "year", "period", "updated_at")
VALUES (-1, -1, '-1', CURRENT_TIMESTAMP);

-- AlterTable: fill the existing events with the "no term" row, then require the column
ALTER TABLE "event" ADD COLUMN "term_id" INTEGER;

UPDATE "event" SET "term_id" = -1;

ALTER TABLE "event" ALTER COLUMN "term_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "event_term_id_idx" ON "event"("term_id");

-- AlterTable: whether a project of the event must belong to a course section (NRC). true for
-- a final projects fair, false for an event that is not course work (a hackathon: its projects
-- get course section 0, "not applicable", in project-service). The existing events take true,
-- so no NRC is dropped silently: a new submission to one of them is rejected until the event
-- gets a term, or is marked as not requiring a course section. New events set it explicitly,
-- so the column keeps no default.
ALTER TABLE "event" ADD COLUMN "requires_course" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "event" ALTER COLUMN "requires_course" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
