import { describe, expect, it } from "vitest";
import { describeNet, formatBasisPoints, formatCents, parseDollarsToCents, parsePercentToBasisPoints } from "./money";

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

describe("formatBasisPoints (US-04)", () => {
  it.each([
    [10_000, "100%"],
    [3333, "33.33%"],
    [2550, "25.5%"],
    [5, "0.05%"],
    [0, "0%"],
    [-150, "-1.5%"],
  ])("formats %s as %s", (bp, text) => {
    expect(formatBasisPoints(bp)).toBe(text);
  });
});

describe("parsePercentToBasisPoints (US-04)", () => {
  it.each([
    ["40", 4000],
    ["33.33", 3333],
    ["12.5%", 1250],
    [" 0 ", 0],
    ["100", 10_000],
    ["0.01", 1],
  ])("parses %j as %s basis points", (text, bp) => {
    expect(parsePercentToBasisPoints(text)).toBe(bp);
  });

  it.each(["", "abc", "-5", "100.01", "101", "33.333", "1,000", ".5"])("rejects %j", (text) => {
    expect(parsePercentToBasisPoints(text)).toBeNull();
  });
});
