import { describe, expect, it } from "vitest";
import { computeBalances, LedgerInvariantError } from "../src/modules/balances/compute.ts";

const members = [
  { userId: "maya", displayName: "Maya" },
  { userId: "josh", displayName: "Josh" },
  { userId: "priya", displayName: "Priya" },
];
const thirds = new Map([
  ["maya", 1000],
  ["josh", 1000],
  ["priya", 1000],
]);

describe("computeBalances (US-05, US-07)", () => {
  it("computes net = paid - share for every member, in member order", () => {
    const balances = computeBalances(members, { paid: new Map([["maya", 3000]]), share: thirds });
    expect(balances.map((b) => [b.userId, b.netCents])).toEqual([
      ["maya", 2000],
      ["josh", -1000],
      ["priya", -1000],
    ]);
  });

  it("treats members with no expenses or settlements as settled up", () => {
    const balances = computeBalances(members, { paid: new Map(), share: new Map() });
    expect(balances.every((b) => b.netCents === 0 && b.paidCents === 0 && b.sentCents === 0)).toBe(true);
  });

  it("counts a confirmed settlement for the payer and against the receiver (US-07)", () => {
    // Josh owed Maya $10.00 and paid her back; Priya still owes $10.00.
    const balances = computeBalances(members, {
      paid: new Map([["maya", 3000]]),
      share: thirds,
      sent: new Map([["josh", 1000]]),
      received: new Map([["maya", 1000]]),
    });
    expect(balances.map((b) => [b.userId, b.sentCents, b.receivedCents, b.netCents])).toEqual([
      ["maya", 0, 1000, 1000],
      ["josh", 1000, 0, 0],
      ["priya", 0, 0, -1000],
    ]);
  });

  it("refuses to return balances that do not sum to zero", () => {
    expect(() => computeBalances(members, { paid: new Map([["maya", 3000]]), share: new Map([["josh", 2999]]) })).toThrow(
      LedgerInvariantError,
    );
  });

  it("refuses a settlement that was received but never sent (corrupt ledger)", () => {
    expect(() =>
      computeBalances(members, { paid: new Map(), share: new Map(), received: new Map([["maya", 500]]) }),
    ).toThrow(LedgerInvariantError);
  });
});
