-- CreateTable
CREATE TABLE "group_invites" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_token_hash_key" ON "group_invites"("token_hash");

-- CreateIndex
CREATE INDEX "group_invites_group_id_created_at_idx" ON "group_invites"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_created_by_id_fkey" FOREIGN KEY ("group_id", "created_by_id") REFERENCES "group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: an invite can never outlive the 7 days US-02 promises, even if the API had a bug.
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_expiry_within_7_days"
    CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '7 days');
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_token_hash_is_sha256_hex"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
