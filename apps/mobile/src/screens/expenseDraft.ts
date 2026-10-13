import { DESCRIPTION_MAX_LENGTH, MAX_EXPENSE_CENTS, parseDollarsToCents, type CreateExpenseRequest } from "@budgetsplit/shared";

export interface ExpenseDraft {
  description: string;
  amountText: string;
  paidById: string;
}

export type DraftResult =
  | { ok: true; request: CreateExpenseRequest }
  | { ok: false; field: "description" | "amount" | "payer"; message: string };

/**
 * Checks the add-expense form before anything is sent (US-03). The API runs the same rules,
 * so this is for fast feedback, not security.
 */
export function validateDraft(draft: ExpenseDraft): DraftResult {
  const description = draft.description.trim();
  if (description.length === 0) return { ok: false, field: "description", message: "What was it for?" };
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return { ok: false, field: "description", message: `Keep it under ${DESCRIPTION_MAX_LENGTH + 1} characters.` };
  }

  const amountCents = parseDollarsToCents(draft.amountText);
  if (amountCents === null) return { ok: false, field: "amount", message: "Enter an amount like 12.50" };
  if (amountCents < 1) return { ok: false, field: "amount", message: "The amount must be at least $0.01." };
  if (amountCents > MAX_EXPENSE_CENTS) return { ok: false, field: "amount", message: "The limit is $10,000.00." };

  if (!draft.paidById) return { ok: false, field: "payer", message: "Who paid?" };

  return { ok: true, request: { description, amountCents, paidById: draft.paidById } };
}
