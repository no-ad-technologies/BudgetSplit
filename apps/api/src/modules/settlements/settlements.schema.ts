import { z } from "zod";
import { MAX_SETTLEMENT_CENTS, REJECT_REASON_MAX_LENGTH } from "@budgetsplit/shared";

/** Body of POST /groups/:groupId/settlements (US-07). The signed-in member is the payer. */
export const RecordSettlementBody = z.strictObject({
  toUserId: z.uuid(),
  amountCents: z
    .number()
    .int("Amount must be whole cents")
    .min(1, "Amount must be at least $0.01")
    .max(MAX_SETTLEMENT_CENTS, "A single payment can be at most $100,000.00"),
});

/** Body of POST /groups/:groupId/settlements/:settlementId/reject (US-07): a reason is required. */
export const RejectSettlementBody = z.strictObject({
  reason: z.string().trim().min(1, "Say why you're rejecting it").max(REJECT_REASON_MAX_LENGTH),
});

export const ListSettlementsQuery = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RecordSettlementInput = z.infer<typeof RecordSettlementBody>;
