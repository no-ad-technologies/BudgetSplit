/**
 * Settle-up planner (US-06, ADR 0006). Pure functions, so they are unit- and property-tested without a database.
 *
 * Minimum payments = (members with a non-zero balance) − (the most groups they can be split into whose
 * balances each sum to zero), because a zero-sum group of k people always settles in k − 1 payments and
 * never in fewer. Finding that partition is NP-hard in general, so:
 * - up to EXACT_PLAN_MAX_MEMBERS people with a non-zero balance: exact dynamic program over subsets;
 * - more than that: the greedy plan (largest debtor pays largest creditor), at most n − 1 payments,
 *   labelled "suggested" instead of "fewest" (exact: false).
 */

/** 2^12 = 4,096 subsets: the exact plan stays instant on a phone-sized request. */
export const EXACT_PLAN_MAX_MEMBERS = 12;

export interface NetBalance {
  userId: string;
  /** Positive = is owed money, negative = owes money. Balances must sum to 0. */
  netCents: number;
}

export interface Payment {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface SettlementPlan {
  /** True when `payments` is the true minimum number of payments. */
  exact: boolean;
  payments: Payment[];
}

function validate(balances: readonly NetBalance[]): void {
  if (new Set(balances.map((b) => b.userId)).size !== balances.length) {
    throw new RangeError("Each member can appear only once");
  }
  let total = 0;
  for (const { userId, netCents } of balances) {
    if (!Number.isSafeInteger(netCents)) throw new RangeError(`Balance for ${userId} must be whole cents, got ${netCents}`);
    total += netCents;
  }
  if (total !== 0) throw new RangeError(`Balances must sum to 0, got ${total}`);
}

/**
 * Greedy settle-up for one zero-sum set of members: repeatedly the member who owes the most pays the
 * member who is owed the most, as much as either side allows. Each payment clears at least one member,
 * and the last clears two, so k members settle in at most k − 1 payments. Ties go to the earlier member.
 */
export function greedyPayments(balances: readonly NetBalance[]): Payment[] {
  const open = balances.filter((b) => b.netCents !== 0).map((b) => ({ ...b }));
  const payments: Payment[] = [];
  for (;;) {
    let debtor: NetBalance | undefined;
    let creditor: NetBalance | undefined;
    for (const b of open) {
      if (b.netCents < 0 && (!debtor || b.netCents < debtor.netCents)) debtor = b;
      if (b.netCents > 0 && (!creditor || b.netCents > creditor.netCents)) creditor = b;
    }
    if (!debtor || !creditor) return payments;
    const amountCents = Math.min(-debtor.netCents, creditor.netCents);
    payments.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents });
    debtor.netCents += amountCents;
    creditor.netCents -= amountCents;
  }
}

/**
 * Splits members (all with non-zero balances, at most EXACT_PLAN_MAX_MEMBERS) into the largest possible
 * number of groups whose balances each sum to zero. Dynamic program over bitmasks:
 * best[mask] = most zero-sum parts that exactly cover `mask` (only for masks whose sum is 0).
 * The part containing the lowest member of `mask` is tried over every subset, so each partition is
 * considered once. About 3^n / 2 steps: roughly 270,000 for 12 members.
 */
export function maxZeroSumGroups(balances: readonly NetBalance[]): NetBalance[][] {
  const n = balances.length;
  if (n > EXACT_PLAN_MAX_MEMBERS) throw new RangeError(`Exact plan supports at most ${EXACT_PLAN_MAX_MEMBERS} members`);
  const size = 1 << n;
  const sum = new Float64Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low]! + balances[31 - Math.clz32(low)]!.netCents;
  }

  const best = new Int8Array(size).fill(-1);
  const choice = new Int32Array(size);
  best[0] = 0;
  for (let mask = 1; mask < size; mask++) {
    if (sum[mask] !== 0) continue;
    const low = mask & -mask;
    const rest = mask ^ low;
    for (let sub = rest; ; sub = (sub - 1) & rest) {
      const part = sub | low;
      const remaining = mask ^ part;
      if (sum[part] === 0 && best[remaining]! >= 0 && best[remaining]! + 1 > best[mask]!) {
        best[mask] = best[remaining]! + 1;
        choice[mask] = part;
      }
      if (sub === 0) break;
    }
  }

  const groups: NetBalance[][] = [];
  for (let mask = size - 1; mask !== 0; mask ^= choice[mask]!) {
    const part = choice[mask]!;
    groups.push(balances.filter((_, i) => (part >> i) & 1));
  }
  return groups;
}

/**
 * The plan that clears every balance (US-06). Members are expected in join order, which decides ties.
 * Exact (fewest payments) for up to 12 members with a non-zero balance; greedy (at most n − 1) above that.
 */
export function planSettlement(balances: readonly NetBalance[]): SettlementPlan {
  validate(balances);
  const open = balances.filter((b) => b.netCents !== 0);
  if (open.length > EXACT_PLAN_MAX_MEMBERS) return { exact: false, payments: greedyPayments(open) };
  return { exact: true, payments: maxZeroSumGroups(open).flatMap(greedyPayments) };
}
