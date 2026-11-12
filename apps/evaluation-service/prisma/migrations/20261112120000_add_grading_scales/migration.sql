-- CreateTable
CREATE TABLE "public"."grading_scales" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "code" VARCHAR(32),
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grading_scale_levels" (
    "scale_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "points" DECIMAL(7,2) NOT NULL,
    CONSTRAINT "grading_scale_levels_pkey" PRIMARY KEY ("scale_id","level"),
    CONSTRAINT "grading_scale_levels_level_range" CHECK ("level" BETWEEN 1 AND 4),
    CONSTRAINT "grading_scale_levels_points_non_negative" CHECK ("points" >= 0)
);

-- CreateTable
CREATE TABLE "public"."event_grading_scale" (
    "event_id" INTEGER NOT NULL,
    "scale_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_grading_scale_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_code_key" ON "public"."grading_scales"("code");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_levels_scale_id_points_key" ON "public"."grading_scale_levels"("scale_id", "points");

-- CreateIndex
CREATE INDEX "event_grading_scale_scale_id_idx" ON "public"."event_grading_scale"("scale_id");

-- AddForeignKey
ALTER TABLE "public"."grading_scale_levels" ADD CONSTRAINT "grading_scale_levels_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "public"."grading_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_grading_scale" ADD CONSTRAINT "event_grading_scale_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "public"."grading_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: read-only system scales. Their points are the values the former
-- evaluation types stored, so existing evaluation_detail scores keep reading
-- back as the same levels. Existing events are assigned by the service at
-- startup, because the events live in event-service's database.
INSERT INTO "public"."grading_scales" ("id", "name", "description", "is_system", "code") VALUES
    (1, 'Proyectos finales', 'Escala de proyectos finales: 25, 55, 75 y 90 puntos.', true, 'FINAL_PROJECTS'),
    (2, 'Cero a cinco', 'Escala de 0 a 5: 2, 3, 4 y 5 puntos.', true, 'ZERO_TO_FIVE'),
    (3, 'Cero a cien', 'Escala de 0 a 100: 40, 60, 80 y 100 puntos.', true, 'ZERO_TO_HUNDRED');

INSERT INTO "public"."grading_scale_levels" ("scale_id", "level", "label", "points") VALUES
    (1, 1, 'Insuficiente', 25), (1, 2, 'Aceptable', 55), (1, 3, 'Bueno', 75), (1, 4, 'Excelente', 90),
    (2, 1, 'Insuficiente', 2),  (2, 2, 'Aceptable', 3),  (2, 3, 'Bueno', 4),  (2, 4, 'Excelente', 5),
    (3, 1, 'Insuficiente', 40), (3, 2, 'Aceptable', 60), (3, 3, 'Bueno', 80), (3, 4, 'Excelente', 100);

SELECT setval(pg_get_serial_sequence('"public"."grading_scales"', 'id'), (SELECT MAX("id") FROM "public"."grading_scales"));
