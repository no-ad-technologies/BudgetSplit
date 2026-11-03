import { describe, expect, it } from "vitest";
import { describePayment } from "./settleUpText";

const payment = { fromUserId: "josh", fromName: "Josh", toUserId: "maya", toName: "Maya", amountCents: 4250 };

describe("describePayment (US-06)", () => {
  it("speaks to the payer, the receiver and everyone else", () => {
    expect(describePayment(payment, "josh")).toBe("You pay Maya $42.50");
    expect(describePayment(payment, "maya")).toBe("Josh pays you $42.50");
    expect(describePayment(payment, "sam")).toBe("Josh pays Maya $42.50");
  });
});
