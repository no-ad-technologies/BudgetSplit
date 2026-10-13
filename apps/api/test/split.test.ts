import { describe, expect, it } from "vitest";
import { splitEven } from "../src/modules/expenses/split.ts";

const members = (n: number) => Array.from({ length: n }, (_, i) => `member-${i + 1}`);
const total = (shares: { shareCents: number }[]) => shares.reduce((sum, s) => sum + s.shareCents, 0);

describe("splitEven (US-03)", () => {
  it("splits $50.00 across 4 members as $12.50 each", () => {
    expect(splitEven(5000, members(4)).map((s) => s.shareCents)).toEqual([1250, 1250, 1250, 1250]);
  });

  it("gives leftover cents to the first members in join order: $10.00 / 3 = 3.34, 3.33, 3.33", () => {
    expect(splitEven(1000, members(3)).map((s) => s.shareCents)).toEqual([334, 333, 333]);
  });

  it("handles amounts smaller than the number of members", () => {
    expect(splitEven(2, members(4)).map((s) => s.shareCents)).toEqual([1, 1, 0, 0]);
  });

  it("keeps the member order it was given", () => {
    expect(splitEven(300, ["c", "a", "b"]).map((s) => s.userId)).toEqual(["c", "a", "b"]);
  });

  it("always sums exactly to the amount and never differs by more than one cent", () => {
    for (let n = 1; n <= 12; n++) {
      for (const amount of [1, 7, 99, 100, 101, 1001, 4510, 99_999, 1_000_000]) {
        const shares = splitEven(amount, members(n));
        expect(total(shares)).toBe(amount);
        const values = shares.map((s) => s.shareCents);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each([0, -100, 12.5, Number.NaN])("rejects amount %s", (amount) => {
    expect(() => splitEven(amount, members(2))).toThrow(RangeError);
  });

  it("rejects an empty or duplicated member list", () => {
    expect(() => splitEven(100, [])).toThrow(RangeError);
    expect(() => splitEven(100, ["a", "a"])).toThrow(RangeError);
  });
});
