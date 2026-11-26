-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "public"."email_deliveries" (
    "id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(255),
    "recipient" VARCHAR(320) NOT NULL,
    "template" VARCHAR(64) NOT NULL,
    "params" JSONB,
    "status" "public"."EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(32),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_idempotency_key_key" ON "public"."email_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_deliveries_status_next_attempt_at_idx" ON "public"."email_deliveries"("status", "next_attempt_at");
