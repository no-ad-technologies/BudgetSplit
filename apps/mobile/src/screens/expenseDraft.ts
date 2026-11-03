import {
  DESCRIPTION_MAX_LENGTH,
  FULL_PERCENT_BASIS_POINTS,
  MAX_EXPENSE_CENTS,
  formatBasisPoints,
  formatCents,
  parseDollarsToCents,
  parsePercentToBasisPoints,
  type CreateExpenseRequest,
} from "@budgetsplit/shared";

export type SplitMode = "EVEN" | "PERCENT" | "EXACT";

export interface ExpenseDraft {
  description: string;
  amountText: string;
  paidById: string;
  /** How to split (US-04). Defaults to an even split across every member (US-03). */
  splitMode?: SplitMode;
  /** What the user typed per member for PERCENT ("40") or EXACT ("12.50"), keyed by user id. Blank = left out. */
  shareText?: Readonly<Record<string, string>>;
}

export type DraftField = "description" | "amount" | "payer" | "split";

export type DraftResult =
  | { ok: true; request: CreateExpenseRequest }
  | { ok: false; field: DraftField; message: string };

/** Live status of a percent or custom split, shown under the share inputs while the user types. */
export interface SplitProgress {
  /** True when Save may be pressed: every entry is valid and the shares add up. */
  complete: boolean;
  /** Members whose entry can't be read, so the form can outline those inputs in red. */
  invalidMemberIds: string[];
  /** "Adds up to 100%", "10% left to assign", "$0.50 over the total", ... */
  message: string;
}

/**
 * Reads the per-member inputs of a percent or custom split (US-04): Save stays disabled and the
 * difference is shown until percentages total 100% or the amounts total the expense amount.
 * Blank inputs mean the member is left out ($0.00). Even splits are always complete.
 */
export function splitProgress(draft: ExpenseDraft): SplitProgress {
  const mode = draft.splitMode ?? "EVEN";
  if (mode === "EVEN") return { complete: true, invalidMemberIds: [], message: "" };

  const entries = Object.entries(draft.shareText ?? {}).filter(([, text]) => text.trim() !== "");
  const parse = mode === "PERCENT" ? parsePercentToBasisPoints : parseDollarsToCents;
  const invalidMemberIds = entries.filter(([, text]) => parse(text) === null).map(([userId]) => userId);
  if (invalidMemberIds.length > 0) {
    const example = mode === "PERCENT" ? "a percentage like 33.33" : "an amount like 12.50";
    return { complete: false, invalidMemberIds, message: `Enter ${example} for the highlighted members.` };
  }
  const total = entries.reduce((sum, [, text]) => sum + (parse(text) ?? 0), 0);

  if (mode === "PERCENT") {
    if (total === FULL_PERCENT_BASIS_POINTS) return { complete: true, invalidMemberIds, message: "Adds up to 100%" };
    const gap = FULL_PERCENT_BASIS_POINTS - total;
    return {
      complete: false,
      invalidMemberIds,
      message: gap > 0 ? `${formatBasisPoints(gap)} left to assign` : `${formatBasisPoints(-gap)} over 100%`,
    };
  }

  const amountCents = parseDollarsToCents(draft.amountText);
  if (amountCents === null || amountCents < 1) {
    return { complete: false, invalidMemberIds, message: "Enter the total amount first." };
  }
  if (total === amountCents) return { complete: true, invalidMemberIds, message: `Adds up to ${formatCents(total)}` };
  const gap = amountCents - total;
  return {
    complete: false,
    invalidMemberIds,
    message: gap > 0 ? `${formatCents(gap)} left to assign` : `${formatCents(-gap)} over the total`,
  };
}

/**
 * Checks the add-expense form before anything is sent (US-03, US-04). The API runs the same rules,
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

  const base = { description, amountCents, paidById: draft.paidById };
  const mode = draft.splitMode ?? "EVEN";
  if (mode === "EVEN") return { ok: true, request: base };

  const progress = splitProgress(draft);
  if (!progress.complete) return { ok: false, field: "split", message: progress.message };

  // Only members with a non-zero share are sent; the API records everyone else at $0.00.
  const entries = Object.entries(draft.shareText ?? {}).filter(([, text]) => text.trim() !== "");
  if (mode === "PERCENT") {
    const shares = entries
      .map(([userId, text]) => ({ userId, basisPoints: parsePercentToBasisPoints(text)! }))
      .filter((s) => s.basisPoints > 0);
    return { ok: true, request: { ...base, split: { type: "PERCENT", shares } } };
  }
  const shares = entries
    .map(([userId, text]) => ({ userId, shareCents: parseDollarsToCents(text)! }))
    .filter((s) => s.shareCents > 0);
  return { ok: true, request: { ...base, split: { type: "EXACT", shares } } };
}
