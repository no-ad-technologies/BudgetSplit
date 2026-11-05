-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "responded_by_id" UUID,
    "responded_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(140),
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlements_group_id_created_at_idx" ON "settlements"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "settlements_group_id_status_idx" ON "settlements"("group_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_group_id_idempotency_key_key" ON "settlements"("group_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_from_user_id_fkey" FOREIGN KEY ("group_id", "from_user_id") REFERENCES "group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_to_user_id_fkey" FOREIGN KEY ("group_id", "to_user_id") REFERENCES "group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_recorded_by_id_fkey" FOREIGN KEY ("group_id", "recorded_by_id") REFERENCES "group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma schema can't express CHECK constraints. They keep the audit trail consistent
-- even if the API had a bug (reliability, ADR 0003; US-07 audit criterion).
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_cents_range"
    CHECK ("amount_cents" > 0 AND "amount_cents" <= 10000000);
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_not_to_self"
    CHECK ("from_user_id" <> "to_user_id");
-- A pending settlement has no response; a confirmed or rejected one records who responded and when.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_response_matches_status"
    CHECK (("status" = 'PENDING') = ("responded_at" IS NULL)
       AND ("status" = 'PENDING') = ("responded_by_id" IS NULL));
-- Only the receiver can confirm or reject.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_responder_is_receiver"
    CHECK ("responded_by_id" IS NULL OR "responded_by_id" = "to_user_id");
-- A rejection always says why; nothing else has a reason.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_reason_only_when_rejected"
    CHECK (("status" = 'REJECTED') = ("reject_reason" IS NOT NULL));
