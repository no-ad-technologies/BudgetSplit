import { describe, expect, it } from "vitest";
import { splitProgress, validateDraft } from "./expenseDraft";

const payer = "11111111-1111-4111-8111-111111111111";

describe("validateDraft", () => {
  it("turns a valid form into an API request in cents", () => {
    expect(validateDraft({ description: "  Groceries ", amountText: "$50", paidById: payer })).toEqual({
      ok: true,
      request: { description: "Groceries", amountCents: 5000, paidById: payer },
    });
  });

  it.each([
    [{ description: "", amountText: "5", paidById: payer }, "description"],
    [{ description: "x".repeat(81), amountText: "5", paidById: payer }, "description"],
    [{ description: "Pizza", amountText: "twelve", paidById: payer }, "amount"],
    [{ description: "Pizza", amountText: "0.00", paidById: payer }, "amount"],
    [{ description: "Pizza", amountText: "10000.01", paidById: payer }, "amount"],
    [{ description: "Pizza", amountText: "12", paidById: "" }, "payer"],
  ] as const)("flags the %# invalid draft on the right field", (draft, field) => {
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe(field);
  });
});

describe("percent and custom splits (US-04)", () => {
  const maya = "11111111-1111-4111-8111-111111111111";
  const josh = "22222222-2222-4222-8222-222222222222";
  const rent = { description: "Rent", amountText: "1500", paidById: maya };

  it("shows how much is left while percentages are under 100% and blocks Save", () => {
    const draft = { ...rent, splitMode: "PERCENT" as const, shareText: { [maya]: "40", [josh]: "30" } };
    expect(splitProgress(draft)).toEqual({ complete: false, invalidMemberIds: [], message: "30% left to assign" });
    expect(validateDraft(draft)).toEqual({ ok: false, field: "split", message: "30% left to assign" });
  });

  it("says how far over 100% the percentages are", () => {
    const draft = { ...rent, splitMode: "PERCENT" as const, shareText: { [maya]: "60", [josh]: "40.5" } };
    expect(splitProgress(draft).message).toBe("0.5% over 100%");
  });

  it("sends only non-zero percentages once they add up to 100%", () => {
    const draft = { ...rent, splitMode: "PERCENT" as const, shareText: { [maya]: "60", [josh]: "40", other: "0" } };
    expect(validateDraft(draft)).toEqual({
      ok: true,
      request: {
        description: "Rent",
        amountCents: 150_000,
        paidById: maya,
        split: {
          type: "PERCENT",
          shares: [
            { userId: maya, basisPoints: 6000 },
            { userId: josh, basisPoints: 4000 },
          ],
        },
      },
    });
  });

  it("shows the dollar difference for custom amounts, under and over", () => {
    const base = { description: "Tickets", amountText: "90", paidById: maya, splitMode: "EXACT" as const };
    expect(splitProgress({ ...base, shareText: { [maya]: "50", [josh]: "39.99" } }).message).toBe("$0.01 left to assign");
    expect(splitProgress({ ...base, shareText: { [maya]: "50", [josh]: "40.50" } }).message).toBe("$0.50 over the total");
    expect(splitProgress({ ...base, shareText: { [maya]: "50", [josh]: "40" } })).toEqual({
      complete: true,
      invalidMemberIds: [],
      message: "Adds up to $90.00",
    });
  });

  it("highlights entries it can't read and treats blanks as left out", () => {
    const draft = { ...rent, splitMode: "EXACT" as const, shareText: { [maya]: "abc", [josh]: "  " } };
    expect(splitProgress(draft)).toMatchObject({ complete: false, invalidMemberIds: [maya] });
  });

  it("asks for the total before custom amounts can add up", () => {
    const draft = { ...rent, amountText: "", splitMode: "EXACT" as const, shareText: { [maya]: "10" } };
    expect(splitProgress(draft).message).toBe("Enter the total amount first.");
  });
});
