-- CU-86e3vmxar / IRIS-V3-EVAL-02
-- Components are configured per event with a weight (fraction of the grade),
-- criteria carry a relative weight inside their component, and every evaluation
-- detail stores the effective weight it was graded with.

-- 1. Effective weight stored with each evaluation detail.
-- Until now the grade was sum(points x criterions.weight), so the current criterion
-- weight is the weight each historical detail was graded with (unless it was edited later).
ALTER TABLE "public"."evaluation_detail" ADD COLUMN "weight" DOUBLE PRECISION;

UPDATE "public"."evaluation_detail" AS d
SET "weight" = c."weight"
FROM "public"."criterions" AS c
WHERE c."id" = d."criterion_id";

ALTER TABLE "public"."evaluation_detail" ALTER COLUMN "weight" SET NOT NULL;

-- 2. Every component belongs to exactly one event.

-- 2a. Components without event that are used by criteria take the event of those criteria.
UPDATE "public"."Component" AS comp
SET "event_id" = used."event_id"
FROM (
    SELECT "component_id", MIN("event_id") AS "event_id"
    FROM "public"."criterions"
    WHERE "component_id" IS NOT NULL
    GROUP BY "component_id"
) AS used
WHERE comp."id" = used."component_id"
  AND comp."event_id" IS NULL;

-- 2b. A component whose own event has no criteria in it, but that is used by criteria of
-- other events, moves to the first of those events instead of being copied: a copy would
-- leave the original empty and its event could never be evaluated.
UPDATE "public"."Component" AS comp
SET "event_id" = used."event_id"
FROM (
    SELECT "component_id", MIN("event_id") AS "event_id"
    FROM "public"."criterions"
    WHERE "component_id" IS NOT NULL
    GROUP BY "component_id"
) AS used
WHERE comp."id" = used."component_id"
  AND NOT EXISTS (
      SELECT 1
      FROM "public"."criterions" AS own
      WHERE own."component_id" = comp."id"
        AND own."event_id" = comp."event_id"
  );

-- 2c. Components still shared by criteria of several events are copied once per extra event,
-- and the criteria of that event are moved to their copy.
DO $$
DECLARE
    shared RECORD;
    copy_id INT;
BEGIN
    FOR shared IN
        SELECT DISTINCT c."component_id" AS "component_id", c."event_id" AS "event_id"
        FROM "public"."criterions" AS c
        JOIN "public"."Component" AS comp ON comp."id" = c."component_id"
        WHERE c."event_id" <> comp."event_id"
    LOOP
        INSERT INTO "public"."Component" ("name", "weight", "event_id")
        SELECT "name", "weight", shared."event_id"
        FROM "public"."Component"
        WHERE "id" = shared."component_id"
        RETURNING "id" INTO copy_id;

        UPDATE "public"."criterions"
        SET "component_id" = copy_id
        WHERE "component_id" = shared."component_id"
          AND "event_id" = shared."event_id";
    END LOOP;
END $$;

-- 2d. Active criteria without component go to a "General" component of their event.
-- Inactive (deleted) criteria are not part of any rubric: they keep no component, otherwise
-- "General" would have no active criterion and no category of the event could be evaluated.
DO $$
DECLARE
    orphan RECORD;
    general_id INT;
BEGIN
    FOR orphan IN
        SELECT DISTINCT "event_id"
        FROM "public"."criterions"
        WHERE "component_id" IS NULL
          AND "active" = true
    LOOP
        INSERT INTO "public"."Component" ("name", "weight", "event_id")
        VALUES ('General', 0, orphan."event_id")
        RETURNING "id" INTO general_id;

        UPDATE "public"."criterions"
        SET "component_id" = general_id
        WHERE "component_id" IS NULL
          AND "active" = true
          AND "event_id" = orphan."event_id";
    END LOOP;
END $$;

-- 2e. Components still without event are not used by any criterion.
DELETE FROM "public"."Component" WHERE "event_id" IS NULL;

-- 3. The component weight is now configured, not the sum of its criteria across
-- categories and events. Start from the sum of its active criteria in one category
-- (an event has a single rubric, so every category gives the same value); the
-- administrator then adjusts it so the components of the event add up to 1.
UPDATE "public"."Component" AS comp
SET "weight" = per_component."weight"
FROM (
    SELECT "component_id", MAX("total") AS "weight"
    FROM (
        SELECT c."component_id", cc."course_id", SUM(c."weight") AS "total"
        FROM "public"."criterions" AS c
        JOIN "public"."criterions_courses" AS cc ON cc."criterion_id" = c."id"
        WHERE c."active" = true
        GROUP BY c."component_id", cc."course_id"
    ) AS per_course
    GROUP BY "component_id"
) AS per_component
WHERE comp."id" = per_component."component_id";

-- 4. Criterion weights become relative to the other criteria of their component, and a new
-- criterion gets 1 by default. Rescale the old absolute weights (e.g. 0.1 / 0.09 / 0.09) so
-- the average active criterion of each component weighs 1 (1.07 / 0.96 / 0.96): proportions
-- are kept and a new criterion enters as an average one, not with most of the component.
-- Evaluation details keep the absolute weights they were graded with (step 1).
UPDATE "public"."criterions" AS c
SET "weight" = c."weight" * per_component."active_count" / per_component."total"
FROM (
    SELECT "component_id", COUNT(*) AS "active_count", SUM("weight") AS "total"
    FROM "public"."criterions"
    WHERE "active" = true
      AND "component_id" IS NOT NULL
    GROUP BY "component_id"
) AS per_component
WHERE c."component_id" = per_component."component_id"
  AND c."active" = true
  AND per_component."total" > 0;

ALTER TABLE "public"."Component" ALTER COLUMN "event_id" SET NOT NULL;
