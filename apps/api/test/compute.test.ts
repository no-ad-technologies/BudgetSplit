import { describe, expect, it } from "vitest";
import { computeBalances, LedgerInvariantError } from "../src/modules/balances/compute.ts";

const members = [
  { userId: "maya", displayName: "Maya" },
  { userId: "josh", displayName: "Josh" },
  { userId: "priya", displayName: "Priya" },
];

describe("computeBalances (US-05)", () => {
  it("computes net = paid - share for every member, in member order", () => {
    const balances = computeBalances(
      members,
      new Map([["maya", 3000]]),
      new Map([
        ["maya", 1000],
        ["josh", 1000],
        ["priya", 1000],
      ]),
    );
    expect(balances.map((b) => [b.userId, b.netCents])).toEqual([
      ["maya", 2000],
      ["josh", -1000],
      ["priya", -1000],
    ]);
  });

  it("treats members with no expenses as settled up", () => {
    const balances = computeBalances(members, new Map(), new Map());
    expect(balances.every((b) => b.netCents === 0 && b.paidCents === 0 && b.shareCents === 0)).toBe(true);
  });

  it("refuses to return balances that do not sum to zero", () => {
    expect(() => computeBalances(members, new Map([["maya", 3000]]), new Map([["josh", 2999]]))).toThrow(
      LedgerInvariantError,
    );
  });
});
