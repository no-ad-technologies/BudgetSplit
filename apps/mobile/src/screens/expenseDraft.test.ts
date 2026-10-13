import { describe, expect, it } from "vitest";
import { validateDraft } from "./expenseDraft";

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
