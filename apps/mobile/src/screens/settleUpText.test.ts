import { describe, expect, it } from "vitest";
import type { SettlementDto } from "@budgetsplit/shared";
import { describePayment, describePending, isAlreadyRecorded } from "./settleUpText";

const payment = { fromUserId: "josh", fromName: "Josh", toUserId: "maya", toName: "Maya", amountCents: 4250 };
const pending: SettlementDto = {
  id: "s1",
  groupId: "g1",
  fromUserId: "josh",
  fromName: "Josh",
  toUserId: "maya",
  toName: "Maya",
  amountCents: 4250,
  status: "PENDING",
  recordedById: "josh",
  createdAt: "2026-11-03T12:00:00.000Z",
  respondedById: null,
  respondedAt: null,
  rejectReason: null,
};

describe("describePayment (US-06)", () => {
  it("speaks to the payer, the receiver and everyone else", () => {
    expect(describePayment(payment, "josh")).toBe("You pay Maya $42.50");
    expect(describePayment(payment, "maya")).toBe("Josh pays you $42.50");
    expect(describePayment(payment, "sam")).toBe("Josh pays Maya $42.50");
  });
});

describe("pending settlements (US-07)", () => {
  it("asks only the receiver to answer", () => {
    expect(describePending(pending, "maya")).toEqual({ text: "Josh says they paid you $42.50", needsMyAnswer: true });
    expect(describePending(pending, "josh")).toEqual({
      text: "You paid Maya $42.50 · waiting for Maya to confirm",
      needsMyAnswer: false,
    });
    expect(describePending(pending, "sam")).toEqual({ text: "Josh paid Maya $42.50 · pending", needsMyAnswer: false });
  });

  it("knows a suggested payment was already recorded only if payer, receiver and amount all match", () => {
    expect(isAlreadyRecorded(payment, [pending])).toBe(true);
    expect(isAlreadyRecorded({ ...payment, amountCents: 4249 }, [pending])).toBe(false);
    expect(isAlreadyRecorded(payment, [{ ...pending, status: "REJECTED" }])).toBe(false);
    expect(isAlreadyRecorded(payment, [])).toBe(false);
  });
});
