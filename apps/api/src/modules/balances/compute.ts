import type { MemberBalanceDto } from "@budgetsplit/shared";

export interface BalanceMember {
  userId: string;
  displayName: string;
}

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerInvariantError";
  }
}

/**
 * Turns per-member totals into net balances (US-05). Pure, so it is unit-tested without a database.
 *
 * net = paid - share. Because every expense's shares add up to its amount, the nets of a group
 * always sum to exactly zero. If they don't, the ledger is corrupt; we fail loudly (HTTP 500)
 * instead of showing a wrong balance. Reliability ranks above availability (trade-off T1).
 */
export function computeBalances(
  members: readonly BalanceMember[],
  paidByUser: ReadonlyMap<string, number>,
  shareByUser: ReadonlyMap<string, number>,
): MemberBalanceDto[] {
  const balances = members.map(({ userId, displayName }) => {
    const paidCents = paidByUser.get(userId) ?? 0;
    const shareCents = shareByUser.get(userId) ?? 0;
    return { userId, displayName, paidCents, shareCents, netCents: paidCents - shareCents };
  });

  const total = balances.reduce((sum, b) => sum + b.netCents, 0);
  if (total !== 0) {
    throw new LedgerInvariantError(`Group balances sum to ${total} cents instead of 0`);
  }
  return balances;
}
