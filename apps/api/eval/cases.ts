/**
 * The evaluation set for the AI fairness summary (US-11, docs/ai/m4-ai-evaluation.md).
 *
 * Model answers vary from run to run, so nothing here is an expected string. Each case is a fixed input
 * (the statistics a group would produce) plus criteria any acceptable answer must meet. `judge` in
 * criteria.ts applies them.
 */
import type { SummaryWindowDays } from "@budgetsplit/shared";
import { buildStats, type ContributionStats } from "../src/modules/insights/stats.ts";

export interface EvalCase {
  id: string;
  /** What this case is checking, in one line. */
  why: string;
  stats: ContributionStats;
  /** Strings an acceptable answer contains (aliases and exact figures). */
  mustMention?: string[];
  /** An acceptable answer matches every one of these. */
  mustMatch?: RegExp[];
  /** An acceptable answer matches none of these. */
  mustNotMatch?: RegExp[];
}

/** A group from [paidCents, shareCents] pairs in join order (Member A, Member B, …). */
function group(days: SummaryWindowDays, expenseCount: number, members: [paid: number, share: number][]): ContributionStats {
  return buildStats(
    days,
    expenseCount,
    members.map(([paidCents, shareCents], i) => ({ userId: `user-${i}`, displayName: `Person ${i}`, paidCents, shareCents })),
  );
}

const SINGLES_SOMEONE_OUT = /paid (?:\S+ )?(?:more|less) than/i;

export const EVAL_CASES: EvalCase[] = [
  {
    id: "even-four",
    why: "Everyone paid exactly their share: the summary must say so and single nobody out.",
    stats: group(30, 8, [[6000, 6000], [6000, 6000], [6000, 6000], [6000, 6000]]),
    mustMention: ["$240.00"],
    mustMatch: [/even|equal|same|exactly|each/i],
    mustNotMatch: [SINGLES_SOMEONE_OUT],
  },
  {
    id: "one-pays-all",
    why: "One member paid for everything: name them by alias, with the amount, without judging the others.",
    stats: group(30, 5, [[30000, 10000], [0, 10000], [0, 10000]]),
    mustMention: ["Member A", "$300.00"],
  },
  {
    id: "two-payers-two-not",
    why: "The seeded demo group: two members paid, two did not.",
    stats: group(30, 2, [[6000, 2628], [4510, 2628], [0, 2627], [0, 2627]]),
    mustMention: ["Member A", "Member B", "$105.10"],
  },
  {
    id: "solo-member",
    why: "A group of one: no comparison is possible and no second member may be invented.",
    stats: group(30, 3, [[2599, 2599]]),
    mustMention: ["Member A", "$25.99"],
    mustNotMatch: [/Member [B-Z]\b/],
  },
  {
    id: "near-even",
    why: "A gap of well under a dollar: the wording must stay proportionate and neutral.",
    stats: group(30, 6, [[3400, 3334], [3300, 3333], [3300, 3333]]),
    mustMention: ["$100.00"],
  },
  {
    id: "twelve-members",
    why: "A large group with one big payer: still short, still names the largest payer.",
    stats: group(30, 14, [[60000, 6834], [2000, 6834], [2000, 6834], [2000, 6834], ...Array.from({ length: 8 }, (): [number, number] => [2000, 6833])]),
    mustMention: ["Member A", "$820.00"],
  },
  {
    id: "unequal-but-exact",
    why: "Members paid very different amounts, but each paid exactly their own (custom) share: not an imbalance.",
    stats: group(30, 4, [[2000, 2000], [8000, 8000], [5000, 5000]]),
    mustMention: ["$150.00"],
    mustNotMatch: [SINGLES_SOMEONE_OUT],
  },
  {
    id: "thousands",
    why: "Large amounts: figures with thousands separators must be copied exactly.",
    stats: group(90, 9, [[1248000, 700000], [152000, 700000]]),
    mustMention: ["$14,000.00", "$12,480.00"],
  },
  {
    id: "zero-share-payer",
    why: "A member paid for others and had no share of their own (percentage of share is undefined).",
    stats: group(30, 1, [[5000, 0], [0, 2500], [0, 2500]]),
    mustMention: ["Member A", "$50.00"],
    mustNotMatch: [/\bnull\b|undefined|NaN|infinit/i],
  },
  {
    id: "ninety-days-one-expense",
    why: "The 90-day window with a single expense: the period must be right.",
    stats: group(90, 1, [[9999, 5000], [0, 4999]]),
    mustMention: ["$99.99"],
    mustMatch: [/\b90\b/],
  },
];
