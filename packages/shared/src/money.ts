/**
 * Money helpers shared by the API and the mobile app.
 *
 * All amounts in BudgetSplit are integer cents (see docs/adr/0003-integer-cents.md).
 * Nothing here ever uses floating-point arithmetic on money.
 */

/** Largest single expense we accept: $10,000.00 (US-03 acceptance criteria). */
export const MAX_EXPENSE_CENTS = 1_000_000;

/** Longest expense description we accept (US-03 acceptance criteria). */
export const DESCRIPTION_MAX_LENGTH = 80;

function assertIntegerCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Expected integer cents, got ${cents}`);
  }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Formats integer cents as US dollars: 1250 -> "$12.50", 123456 -> "$1,234.56", -5 -> "-$0.05". */
export function formatCents(cents: number): string {
  assertIntegerCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}$${groupThousands(String(dollars))}.${String(rest).padStart(2, "0")}`;
}

const DOLLAR_INPUT = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses what a person types into an amount field into integer cents.
 * Accepts "12", "12.5", "12.50", "$12.50", "1,234.56". Returns null for anything else
 * (negative numbers, more than two decimals, letters, empty input).
 * Uses string math only, so "0.1" + "0.2" style float errors cannot happen.
 */
export function parseDollarsToCents(input: string): number | null {
  const match = DOLLAR_INPUT.exec(input.trim());
  if (!match) return null;
  const whole = Number((match[1] ?? "").replace(/,/g, ""));
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Plain-language balance used on the group screen (US-05): "is owed $12.50", "owes $3.33", "is settled up". */
export function describeNet(netCents: number): string {
  assertIntegerCents(netCents);
  if (netCents > 0) return `is owed ${formatCents(netCents)}`;
  if (netCents < 0) return `owes ${formatCents(-netCents)}`;
  return "is settled up";
}
