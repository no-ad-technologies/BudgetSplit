import { memberAlias, type MemberContributionDto, type SummaryWindowDays } from "@budgetsplit/shared";

export interface MemberTotals {
  userId: string;
  displayName: string;
  paidCents: number;
  shareCents: number;
}

/** Everything a fairness summary is allowed to talk about (US-11). The server computes all of it. */
export interface ContributionStats {
  days: SummaryWindowDays;
  expenseCount: number;
  totalCents: number;
  /** In join order, which is also alias order. */
  members: MemberContributionDto[];
}

/** Whole-number percentage, rounded half up. Integer math only (ADR 0003). */
export function wholePercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 200 + whole) / (whole * 2));
}

/** Turns per-member totals for the window into the statistics behind a summary. Pure. */
export function buildStats(days: SummaryWindowDays, expenseCount: number, members: readonly MemberTotals[]): ContributionStats {
  const totalCents = members.reduce((sum, m) => sum + m.paidCents, 0);
  return {
    days,
    expenseCount,
    totalCents,
    members: members.map((m, index) => ({
      userId: m.userId,
      displayName: m.displayName,
      alias: memberAlias(index),
      paidCents: m.paidCents,
      shareCents: m.shareCents,
      differenceCents: m.paidCents - m.shareCents,
      paidPercent: wholePercent(m.paidCents, totalCents),
    })),
  };
}
