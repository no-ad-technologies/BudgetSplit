import { describe, expect, it } from "vitest";
import { describeNet, formatCents, parseDollarsToCents } from "./money";

describe("formatCents", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [1250, "$12.50"],
    [123456, "$1,234.56"],
    [100000000, "$1,000,000.00"],
    [-5, "-$0.05"],
  ])("formats %i as %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(12.5)).toThrow(TypeError);
  });
});

describe("parseDollarsToCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["$12.50", 1250],
    [" 0.01 ", 1],
    ["1,234.56", 123456],
    ["0.1", 10],
  ])("parses %s as %i cents", (input, expected) => {
    expect(parseDollarsToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12.345", "1,23.00", "12.", ".5", "1e3"])("rejects %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });
});

describe("describeNet", () => {
  it("says who is owed, who owes and who is even", () => {
    expect(describeNet(3750)).toBe("is owed $37.50");
    expect(describeNet(-1250)).toBe("owes $12.50");
    expect(describeNet(0)).toBe("is settled up");
  });
});
