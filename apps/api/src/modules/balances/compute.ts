import type { MemberBalanceDto } from "@budgetsplit/shared";

export interface BalanceMember {
  userId: string;
  displayName: string;
}

/** Per-member totals in cents, keyed by user id. Members with no entry count as 0. */
export interface LedgerTotals {
  paid: ReadonlyMap<string, number>;
  share: ReadonlyMap<string, number>;
  /** Confirmed settlements paid (US-07). */
  sent?: ReadonlyMap<string, number>;
  /** Confirmed settlements received (US-07). */
  received?: ReadonlyMap<string, number>;
}

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerInvariantError";
  }
}

/**
 * Turns per-member totals into net balances (US-05, US-07). Pure, so it is unit-tested without a database.
 *
 * net = paid − share + sent − received. Every expense's shares add up to its amount, and every confirmed
 * settlement is sent by one member and received by another, so a group's nets always sum to exactly
 * zero. If they don't, the ledger is corrupt; we fail loudly (HTTP 500) instead of showing a wrong
 * balance. Reliability ranks above availability (trade-off T1).
 */
export function computeBalances(members: readonly BalanceMember[], totals: LedgerTotals): MemberBalanceDto[] {
  const get = (map: ReadonlyMap<string, number> | undefined, userId: string) => map?.get(userId) ?? 0;
  const balances = members.map(({ userId, displayName }) => {
    const paidCents = get(totals.paid, userId);
    const shareCents = get(totals.share, userId);
    const sentCents = get(totals.sent, userId);
    const receivedCents = get(totals.received, userId);
    return {
      userId,
      displayName,
      paidCents,
      shareCents,
      sentCents,
      receivedCents,
      netCents: paidCents - shareCents + sentCents - receivedCents,
    };
  });

  const total = balances.reduce((sum, b) => sum + b.netCents, 0);
  if (total !== 0) {
    throw new LedgerInvariantError(`Group balances sum to ${total} cents instead of 0`);
  }
  return balances;
}
