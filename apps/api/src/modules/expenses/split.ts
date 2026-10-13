export interface Share {
  userId: string;
  shareCents: number;
}

/**
 * Splits an amount evenly in integer cents (US-03).
 *
 * Every member gets floor(amount / n). The leftover cents (always fewer than n) go one each to
 * the first members in the order given, which callers pass as group join order. So $10.00 split
 * three ways is 334 / 333 / 333, and the shares always add up to exactly the amount.
 */
export function splitEven(amountCents: number, memberIds: readonly string[]): Share[] {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError(`amountCents must be a positive integer, got ${amountCents}`);
  }
  if (memberIds.length === 0) {
    throw new RangeError("Cannot split an expense across zero members");
  }
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RangeError("memberIds must not contain duplicates");
  }

  const n = memberIds.length;
  const base = Math.floor(amountCents / n);
  const leftover = amountCents - base * n;
  return memberIds.map((userId, index) => ({ userId, shareCents: base + (index < leftover ? 1 : 0) }));
}
