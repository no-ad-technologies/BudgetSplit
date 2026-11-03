/**
 * Hand-designed unit tests for splitByPercent and splitExact (US-04).
 * Each test is named after a row of the equivalence-partitioning table in
 * docs/testing/equivalence-partitioning.md, so the table and the tests can be checked against each other.
 */
import { describe, expect, it } from "vitest";
import { splitByPercent, splitExact, type PercentAllocation } from "../src/modules/expenses/split.ts";

const cents = (shares: { shareCents: number }[]) => shares.map((s) => s.shareCents);
const total = (shares: { shareCents: number }[]) => shares.reduce((sum, s) => sum + s.shareCents, 0);
const pct = (...basisPoints: number[]): PercentAllocation[] =>
  basisPoints.map((bp, i) => ({ userId: `m${i + 1}`, basisPoints: bp }));

describe("splitByPercent: valid partitions", () => {
  it("V1 amount at both boundaries: 1 cent and $10,000.00", () => {
    expect(cents(splitByPercent(1, pct(10_000)))).toEqual([1]);
    expect(cents(splitByPercent(1_000_000, pct(2500, 7500)))).toEqual([250_000, 750_000]);
  });

  it("V2 one member at 100% pays everything", () => {
    expect(cents(splitByPercent(4510, pct(10_000)))).toEqual([4510]);
  });

  it("V3 several members whose percentages total exactly 100%", () => {
    expect(cents(splitByPercent(120_000, pct(4000, 3000, 2000, 1000)))).toEqual([48_000, 36_000, 24_000, 12_000]);
  });

  it("V4 no leftover: every exact share is whole cents (rent $1,500 at 40/30/30)", () => {
    expect(cents(splitByPercent(150_000, pct(4000, 3000, 3000)))).toEqual([60_000, 45_000, 45_000]);
  });

  it("V5 leftover cents go one each, in join order, to members with a fraction ($0.02 at 33.33/33.33/33.34)", () => {
    // Exact shares are 0.6666, 0.6666 and 0.6668 cents; floors are all 0, leftover is 2.
    expect(cents(splitByPercent(2, pct(3333, 3333, 3334)))).toEqual([1, 1, 0]);
  });

  it("V6 a member at 0% pays $0.00 even when they joined first and there are leftover cents", () => {
    // $9.99 at 0/50/50: exact shares 0, 4.995, 4.995 dollars. The leftover cent must skip m1.
    expect(cents(splitByPercent(999, pct(0, 5000, 5000)))).toEqual([0, 500, 499]);
  });

  it("V7 a member whose exact share is already whole never gets a leftover cent, even if first in join order", () => {
    // $10.05 at 20/30/50: exact 201 (whole), 301.5, 502.5. Floors total 1004, leftover 1 goes to m2, not m1.
    expect(cents(splitByPercent(1005, pct(2000, 3000, 5000)))).toEqual([201, 302, 502]);
  });

  it("V8 a tiny percentage worth less than a cent can still receive a leftover cent", () => {
    // $1.00 at 0.01% / 99.99%: exact 0.01 and 99.99 cents. m1 has a fraction and is first in join order.
    expect(cents(splitByPercent(100, pct(1, 9999)))).toEqual([1, 99]);
  });

  it("V9 shares come back in the order given (join order) with the same user ids", () => {
    const allocations = [
      { userId: "sam", basisPoints: 2500 },
      { userId: "maya", basisPoints: 7500 },
    ];
    expect(splitByPercent(1000, allocations).map((s) => s.userId)).toEqual(["sam", "maya"]);
  });

  it("V10 property: 2,000 random splits always total the amount and stay within a cent of exact", () => {
    // Small deterministic PRNG (mulberry32) so a failure is reproducible.
    let seed = 20261103;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let run = 0; run < 2000; run++) {
      const n = 1 + Math.floor(random() * 12);
      const cuts = Array.from({ length: n - 1 }, () => Math.floor(random() * 10_001)).sort((a, b) => a - b);
      const bps = [...cuts, 10_000].map((cut, i) => cut - (i === 0 ? 0 : cuts[i - 1]!));
      const amount = 1 + Math.floor(random() * 1_000_000);
      const shares = splitByPercent(amount, pct(...bps));

      expect(total(shares)).toBe(amount);
      shares.forEach((share, i) => {
        const exactTimes10k = amount * bps[i]!; // exact share × 10,000, as an integer
        const floor = Math.floor(exactTimes10k / 10_000);
        const isWhole = exactTimes10k % 10_000 === 0;
        expect(share.shareCents).toBeGreaterThanOrEqual(floor);
        expect(share.shareCents).toBeLessThanOrEqual(isWhole ? floor : floor + 1);
      });
    }
  });
});

describe("splitByPercent: invalid partitions", () => {
  it.each([0, -1])("I1 rejects an amount of %s (zero or negative)", (amount) => {
    expect(() => splitByPercent(amount, pct(10_000))).toThrow(RangeError);
  });

  it("I2 rejects an amount over $10,000.00 (1,000,001 cents)", () => {
    expect(() => splitByPercent(1_000_001, pct(10_000))).toThrow(RangeError);
  });

  it.each([12.5, Number.NaN, Number.POSITIVE_INFINITY])("I3 rejects a non-integer amount (%s)", (amount) => {
    expect(() => splitByPercent(amount, pct(10_000))).toThrow(RangeError);
  });

  it("I4 rejects an empty member list", () => {
    expect(() => splitByPercent(1000, [])).toThrow(RangeError);
  });

  it("I5 rejects the same member listed twice", () => {
    expect(() =>
      splitByPercent(1000, [
        { userId: "maya", basisPoints: 5000 },
        { userId: "maya", basisPoints: 5000 },
      ]),
    ).toThrow(RangeError);
  });

  it("I6 rejects a negative percentage (-0.01%), even when the total is 100%", () => {
    expect(() => splitByPercent(1000, pct(-1, 10_001))).toThrow(RangeError);
  });

  it("I7 rejects a percentage over 100% (100.01%)", () => {
    expect(() => splitByPercent(1000, pct(10_001))).toThrow(RangeError);
  });

  it("I8 rejects a fraction of a basis point (33.335%)", () => {
    expect(() => splitByPercent(1000, pct(3333.5, 3333.5, 3333))).toThrow(RangeError);
  });

  it("I9 rejects percentages totaling 99.99% (just under)", () => {
    expect(() => splitByPercent(1000, pct(5000, 4999))).toThrow(RangeError);
  });

  it("I10 rejects percentages totaling 100.01% (just over)", () => {
    expect(() => splitByPercent(1000, pct(5000, 5001))).toThrow(RangeError);
  });
});

describe("splitExact (US-04 custom amounts)", () => {
  const exact = (...shareCents: number[]) => shareCents.map((c, i) => ({ userId: `m${i + 1}`, shareCents: c }));

  it("E1 accepts custom amounts that add up exactly, including a member left out at $0.00", () => {
    expect(cents(splitExact(9000, exact(5000, 4000, 0)))).toEqual([5000, 4000, 0]);
  });

  it("E2 rejects amounts one cent short of or over the total", () => {
    expect(() => splitExact(9000, exact(5000, 3999))).toThrow(/add up to 8999 cents, not 9000/);
    expect(() => splitExact(9000, exact(5000, 4001))).toThrow(RangeError);
  });

  it("E3 rejects a negative or fractional share even if the total matches", () => {
    expect(() => splitExact(9000, exact(9500, -500))).toThrow(RangeError);
    expect(() => splitExact(9000, exact(4500.5, 4499.5))).toThrow(RangeError);
  });

  it("E4 rejects an empty list and duplicate members", () => {
    expect(() => splitExact(9000, [])).toThrow(RangeError);
    expect(() =>
      splitExact(9000, [
        { userId: "a", shareCents: 4500 },
        { userId: "a", shareCents: 4500 },
      ]),
    ).toThrow(RangeError);
  });
});
