import { FULL_PERCENT_BASIS_POINTS, MAX_EXPENSE_CENTS } from "@budgetsplit/shared";

export interface Share {
  userId: string;
  shareCents: number;
}

/** One member's percentage, in integer basis points: 1% = 100, 33.33% = 3333, 100% = 10,000. */
export interface PercentAllocation {
  userId: string;
  basisPoints: number;
}

/** One member's exact share, in integer cents. */
export interface ExactAllocation {
  userId: string;
  shareCents: number;
}

function assertAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_EXPENSE_CENTS) {
    throw new RangeError(`amountCents must be an integer from 1 to ${MAX_EXPENSE_CENTS}, got ${amountCents}`);
  }
}

function assertDistinctMembers(memberIds: readonly string[]): void {
  if (memberIds.length === 0) {
    throw new RangeError("Cannot split an expense across zero members");
  }
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RangeError("memberIds must not contain duplicates");
  }
}

/**
 * Splits an amount evenly in integer cents (US-03).
 *
 * Every member gets floor(amount / n). The leftover cents (always fewer than n) go one each to
 * the first members in the order given, which callers pass as group join order. So $10.00 split
 * three ways is 334 / 333 / 333, and the shares always add up to exactly the amount.
 */
export function splitEven(amountCents: number, memberIds: readonly string[]): Share[] {
  assertAmount(amountCents);
  assertDistinctMembers(memberIds);

  const n = memberIds.length;
  const base = Math.floor(amountCents / n);
  const leftover = amountCents - base * n;
  return memberIds.map((userId, index) => ({ userId, shareCents: base + (index < leftover ? 1 : 0) }));
}

/**
 * Splits an amount by percentages (US-04), in integer cents.
 *
 * Percentages are integer basis points (1% = 100) and must add up to exactly 10,000 (100%).
 * Each member first gets floor(amount × basisPoints / 10,000). The leftover cents go one each, in the
 * order given (join order, as in US-03), to members whose exact share has a fraction of a cent.
 * So every share is its exact percentage rounded down or up, never more than one cent off, a member
 * at 0% always pays exactly $0.00, and the shares always add up to exactly the amount.
 *
 * Example: $100.01 split 50% / 25% / 25% is 5001 / 2500 / 2500 (the cent goes to the first member).
 */
export function splitByPercent(amountCents: number, allocations: readonly PercentAllocation[]): Share[] {
  assertAmount(amountCents);
  assertDistinctMembers(allocations.map((a) => a.userId));
  for (const { userId, basisPoints } of allocations) {
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > FULL_PERCENT_BASIS_POINTS) {
      throw new RangeError(`Percentage for ${userId} must be 0 to 10,000 basis points, got ${basisPoints}`);
    }
  }
  const totalBasisPoints = allocations.reduce((sum, a) => sum + a.basisPoints, 0);
  if (totalBasisPoints !== FULL_PERCENT_BASIS_POINTS) {
    throw new RangeError(`Percentages must add up to 10,000 basis points (100%), got ${totalBasisPoints}`);
  }

  // amount <= 1,000,000 and basis points <= 10,000, so the product stays far below 2^53.
  const shares = allocations.map(({ userId, basisPoints }) => ({
    userId,
    shareCents: Math.floor((amountCents * basisPoints) / FULL_PERCENT_BASIS_POINTS),
    hasFraction: (amountCents * basisPoints) % FULL_PERCENT_BASIS_POINTS !== 0,
  }));

  // The leftover is the sum of the dropped fractions, so it is always smaller than the number of
  // shares that had one: one pass in join order hands out every leftover cent.
  let leftover = amountCents - shares.reduce((sum, s) => sum + s.shareCents, 0);
  for (const share of shares) {
    if (leftover === 0) break;
    if (share.hasFraction) {
      share.shareCents += 1;
      leftover -= 1;
    }
  }
  return shares.map(({ userId, shareCents }) => ({ userId, shareCents }));
}

/**
 * Validates custom amounts (US-04): every share is whole, non-negative cents and together they add up
 * to exactly the expense amount. A member can be left out with a share of 0. Returns the shares as given.
 */
export function splitExact(amountCents: number, allocations: readonly ExactAllocation[]): Share[] {
  assertAmount(amountCents);
  assertDistinctMembers(allocations.map((a) => a.userId));
  for (const { userId, shareCents } of allocations) {
    if (!Number.isSafeInteger(shareCents) || shareCents < 0) {
      throw new RangeError(`Share for ${userId} must be whole, non-negative cents, got ${shareCents}`);
    }
  }
  const total = allocations.reduce((sum, a) => sum + a.shareCents, 0);
  if (total !== amountCents) {
    throw new RangeError(`Custom amounts add up to ${total} cents, not ${amountCents}`);
  }
  return allocations.map(({ userId, shareCents }) => ({ userId, shareCents }));
}
