import { describe, expect, it } from "vitest";
import type { FairnessSummaryDto } from "@budgetsplit/shared";
import { describeSummary } from "./summaryText";

const base: FairnessSummaryDto = {
  groupId: "g",
  days: 30,
  expenseCount: 2,
  totalCents: 10510,
  status: "ok",
  summary: "Member A paid $60.00 and Member B paid $45.10 of the $105.10 total.",
  members: [
    { userId: "1", displayName: "Maya", alias: "Member A", paidCents: 6000, shareCents: 5255, differenceCents: 745, paidPercent: 57 },
    { userId: "2", displayName: "Josh", alias: "Member B", paidCents: 4510, shareCents: 5255, differenceCents: -745, paidPercent: 43 },
  ],
};

describe("describeSummary (US-11)", () => {
  it("shows the model's text with names in place of aliases", () => {
    expect(describeSummary(base)).toEqual({
      text: "Maya paid $60.00 and Josh paid $45.10 of the $105.10 total.",
      notice: null,
      showNumbers: true,
    });
  });

  it('says "Summary unavailable" and keeps the numbers when the model failed or was rejected', () => {
    const view = describeSummary({ ...base, status: "unavailable", summary: null });
    expect(view.text).toBeNull();
    expect(view.notice).toMatch(/^Summary unavailable/);
    expect(view.showNumbers).toBe(true);
  });

  it("explains the limit and keeps the numbers", () => {
    const view = describeSummary({ ...base, status: "limited", summary: null });
    expect(view.notice).toMatch(/limit/i);
    expect(view.showNumbers).toBe(true);
  });

  it("says so when the window has no expenses", () => {
    expect(describeSummary({ ...base, days: 90, status: "no_expenses", summary: null, expenseCount: 0, totalCents: 0 })).toEqual({
      text: null,
      notice: "No expenses in the last 90 days.",
      showNumbers: false,
    });
  });

  it("never shows text from a non-ok answer, even if one is present", () => {
    expect(describeSummary({ ...base, status: "unavailable" }).text).toBeNull();
  });
});
