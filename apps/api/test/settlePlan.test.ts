import { describe, expect, it } from "vitest";
import {
  EXACT_PLAN_MAX_MEMBERS,
  greedyPayments,
  planSettlement,
  type NetBalance,
  type Payment,
} from "../src/modules/settlements/plan.ts";

const people = (...dollars: number[]): NetBalance[] =>
  dollars.map((d, i) => ({ userId: `m${i + 1}`, netCents: Math.round(d * 100) }));

/** Applies every payment and returns what is left; a correct plan leaves every balance at 0. */
function apply(balances: readonly NetBalance[], payments: readonly Payment[]): Map<string, number> {
  const left = new Map(balances.map((b) => [b.userId, b.netCents]));
  for (const p of payments) {
    left.set(p.fromUserId, left.get(p.fromUserId)! + p.amountCents);
    left.set(p.toUserId, left.get(p.toUserId)! - p.amountCents);
  }
  return left;
}

/**
 * Independent brute force for small groups: try every way to split the members into groups (set
 * partitions) and keep the one with the most zero-sum groups. Minimum payments = n − that number.
 */
function bruteForceMinimum(values: readonly number[]): number {
  const open = values.filter((v) => v !== 0);
  let bestParts = 0;
  const blocks: number[] = []; // running sum of each block
  const place = (i: number) => {
    if (i === open.length) {
      if (blocks.every((s) => s === 0)) bestParts = Math.max(bestParts, blocks.length);
      return;
    }
    for (let b = 0; b < blocks.length; b++) {
      blocks[b]! += open[i]!;
      place(i + 1);
      blocks[b]! -= open[i]!;
    }
    blocks.push(open[i]!);
    place(i + 1);
    blocks.pop();
  };
  place(0);
  return open.length === 0 ? 0 : open.length - bestParts;
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n random balances in whole dollars from −$20 to $20 (some zero), adjusted to sum to 0. */
function randomGroup(random: () => number, n: number): NetBalance[] {
  const dollars = Array.from({ length: n - 1 }, () => Math.floor(random() * 41) - 20);
  dollars.push(-dollars.reduce((a, b) => a + b, 0));
  return people(...dollars);
}

describe("planSettlement (US-06)", () => {
  it("needs no payments when everyone is settled up", () => {
    expect(planSettlement([])).toEqual({ exact: true, payments: [] });
    expect(planSettlement(people(0, 0, 0))).toEqual({ exact: true, payments: [] });
  });

  it("settles two people with one exact payment", () => {
    expect(planSettlement(people(42.5, -42.5)).payments).toEqual([
      { fromUserId: "m2", toUserId: "m1", amountCents: 4250 },
    ]);
  });

  it("settles the seeded Maple St House balances in 3 payments", () => {
    // Maya +$33.72, Josh +$18.82, Priya −$26.27, Sam −$26.27 (walking-skeleton seed).
    const plan = planSettlement(people(33.72, 18.82, -26.27, -26.27));
    expect(plan).toEqual({
      exact: true,
      payments: [
        { fromUserId: "m3", toUserId: "m1", amountCents: 2627 },
        { fromUserId: "m4", toUserId: "m2", amountCents: 1882 },
        { fromUserId: "m4", toUserId: "m1", amountCents: 745 },
      ],
    });
  });

  it("beats the greedy plan when the group splits into zero-sum subgroups", () => {
    // $7 / −$7 settle on their own; the other four need three payments. Greedy pairs the biggest
    // creditor with the biggest debtor first and ends up with five payments instead of four.
    const balances = people(7, -6, 1, -5, -7, 10);
    expect(greedyPayments(balances)).toHaveLength(5);
    const plan = planSettlement(balances);
    expect(plan.exact).toBe(true);
    expect(plan.payments).toHaveLength(4);
    expect([...apply(balances, plan.payments).values()].every((v) => v === 0)).toBe(true);
  });

  it("matches an independent brute force on 300 random groups of up to 8 people", () => {
    const random = seededRandom(6);
    for (let run = 0; run < 300; run++) {
      const balances = randomGroup(random, 1 + Math.floor(random() * 8));
      const plan = planSettlement(balances);
      expect(plan.payments.length).toBe(bruteForceMinimum(balances.map((b) => b.netCents)));
    }
  });

  it("property: 1,000 random groups of up to 12 are fully settled, by debtors paying creditors", () => {
    const random = seededRandom(2026);
    for (let run = 0; run < 1000; run++) {
      const n = 1 + Math.floor(random() * EXACT_PLAN_MAX_MEMBERS);
      const balances = randomGroup(random, n);
      const plan = planSettlement(balances);
      const nonZero = balances.filter((b) => b.netCents !== 0).length;
      const original = new Map(balances.map((b) => [b.userId, b.netCents]));

      expect(plan.exact).toBe(true);
      expect([...apply(balances, plan.payments).values()].every((v) => v === 0)).toBe(true);
      expect(plan.payments.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect(plan.payments.length).toBeLessThanOrEqual(greedyPayments(balances).length);
      for (const p of plan.payments) {
        expect(p.amountCents).toBeGreaterThan(0);
        expect(original.get(p.fromUserId)).toBeLessThan(0);
        expect(original.get(p.toUserId)).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to a labelled greedy plan above 12 people with a balance, still within n − 1 payments", () => {
    // 20 people: owed $1..$10 and owing $1..$10, plus one odd balance so it isn't just pairs.
    const balances = people(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.5, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10.5);
    const plan = planSettlement(balances);
    expect(plan.exact).toBe(false);
    expect(plan.payments.length).toBeLessThanOrEqual(balances.length - 1);
    expect([...apply(balances, plan.payments).values()].every((v) => v === 0)).toBe(true);
  });

  it("plans a 12-person group fast enough for a phone request", () => {
    const balances = people(5, 7, 11, 13, -3, -9, 17, -19, 23, -29, 31, -47);
    const start = performance.now();
    planSettlement(balances);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it.each([
    ["balances that don't sum to zero", people(10, -9.99)],
    ["a fraction of a cent", [{ userId: "a", netCents: 0.5 }, { userId: "b", netCents: -0.5 }]],
    ["the same member twice", [{ userId: "a", netCents: 100 }, { userId: "a", netCents: -100 }]],
  ])("rejects %s", (_label, balances) => {
    expect(() => planSettlement(balances)).toThrow(RangeError);
  });
});
