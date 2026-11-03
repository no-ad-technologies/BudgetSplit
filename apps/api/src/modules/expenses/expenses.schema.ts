import { z } from "zod";
import {
  DESCRIPTION_MAX_LENGTH,
  FULL_PERCENT_BASIS_POINTS,
  MAX_EXPENSE_CENTS,
  MAX_GROUP_MEMBERS,
  formatBasisPoints,
  formatCents,
} from "@budgetsplit/shared";

const eachMemberOnce = (shares: readonly { userId: string }[]) =>
  new Set(shares.map((s) => s.userId)).size === shares.length;

const PercentShare = z.strictObject({
  userId: z.uuid(),
  basisPoints: z
    .number()
    .int("Percentages can have at most two decimals")
    .min(0, "A percentage can't be negative")
    .max(FULL_PERCENT_BASIS_POINTS, "A percentage can be at most 100%"),
});

const ExactShare = z.strictObject({
  userId: z.uuid(),
  shareCents: z
    .number()
    .int("Amounts must be whole cents")
    .min(0, "An amount can't be negative")
    .max(MAX_EXPENSE_CENTS, "An amount can be at most $10,000.00"),
});

const sharesOf = <T extends z.ZodType<{ userId: string }>>(share: T) =>
  z
    .array(share)
    .min(1, "List at least one member")
    .max(MAX_GROUP_MEMBERS)
    .refine(eachMemberOnce, "Each member can appear only once");

/** How the expense is split (US-03 even, US-04 percent and custom). Members not listed get $0.00. */
export const SplitBody = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("EVEN") }),
  z.strictObject({ type: z.literal("PERCENT"), shares: sharesOf(PercentShare) }),
  z.strictObject({ type: z.literal("EXACT"), shares: sharesOf(ExactShare) }),
]);

/**
 * Body of POST /groups/:groupId/expenses (US-03, US-04). Unknown fields are rejected.
 * The totals rule needs both the amount and the split, so it is checked on the whole body: percentages
 * must add up to 100% and custom amounts to the expense amount, or the request is a 400 with a message
 * the app can show as-is.
 */
export const CreateExpenseBody = z
  .strictObject({
    description: z.string().trim().min(1, "Description is required").max(DESCRIPTION_MAX_LENGTH),
    amountCents: z
      .number()
      .int("Amount must be whole cents")
      .min(1, "Amount must be at least $0.01")
      .max(MAX_EXPENSE_CENTS, "Amount can be at most $10,000.00"),
    paidById: z.uuid(),
    split: SplitBody.default({ type: "EVEN" }),
  })
  .superRefine((body, ctx) => {
    if (body.split.type === "PERCENT") {
      const total = body.split.shares.reduce((sum, s) => sum + s.basisPoints, 0);
      if (total !== FULL_PERCENT_BASIS_POINTS) {
        ctx.addIssue({
          code: "custom",
          path: ["split", "shares"],
          message: `Percentages add up to ${formatBasisPoints(total)}, not 100%`,
        });
      }
    } else if (body.split.type === "EXACT") {
      const total = body.split.shares.reduce((sum, s) => sum + s.shareCents, 0);
      if (total !== body.amountCents) {
        ctx.addIssue({
          code: "custom",
          path: ["split", "shares"],
          message: `Custom amounts add up to ${formatCents(total)}, not ${formatCents(body.amountCents)}`,
        });
      }
    }
  });

export type CreateExpenseInput = z.infer<typeof CreateExpenseBody>;

/** Optional Idempotency-Key header: 8 to 100 URL-safe characters. */
export const IdempotencyKey = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Idempotency-Key may only contain letters, digits, - and _")
  .optional();

export const ListExpensesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
