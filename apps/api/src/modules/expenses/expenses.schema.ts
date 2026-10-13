import { z } from "zod";
import { DESCRIPTION_MAX_LENGTH, MAX_EXPENSE_CENTS } from "@budgetsplit/shared";

/** Body of POST /groups/:groupId/expenses (US-03). Unknown fields are rejected. */
export const CreateExpenseBody = z.strictObject({
  description: z.string().trim().min(1, "Description is required").max(DESCRIPTION_MAX_LENGTH),
  amountCents: z
    .number()
    .int("Amount must be whole cents")
    .min(1, "Amount must be at least $0.01")
    .max(MAX_EXPENSE_CENTS, "Amount can be at most $10,000.00"),
  paidById: z.uuid(),
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
