-- AlterTable
ALTER TABLE "email_deliveries" ADD COLUMN     "accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "provider_ref" VARCHAR(64);
