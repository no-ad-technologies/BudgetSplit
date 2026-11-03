import { formatCents, type SettlementDto, type SuggestedPaymentDto } from "@budgetsplit/shared";

/** Plain-language line for one suggested payment (US-06), from the signed-in member's point of view. */
export function describePayment(p: SuggestedPaymentDto, myUserId: string): string {
  const amount = formatCents(p.amountCents);
  if (p.fromUserId === myUserId) return `You pay ${p.toName} ${amount}`;
  if (p.toUserId === myUserId) return `${p.fromName} pays you ${amount}`;
  return `${p.fromName} pays ${p.toName} ${amount}`;
}

/**
 * True when this suggested payment has already been recorded and is waiting for the receiver (US-07),
 * so the app shows "Pending" instead of a second "Record payment" button.
 */
export function isAlreadyRecorded(p: SuggestedPaymentDto, pending: readonly SettlementDto[]): boolean {
  return pending.some(
    (s) => s.status === "PENDING" && s.fromUserId === p.fromUserId && s.toUserId === p.toUserId && s.amountCents === p.amountCents,
  );
}

/** What a pending settlement means to the signed-in member, and whether they are the one who must act. */
export function describePending(s: SettlementDto, myUserId: string): { text: string; needsMyAnswer: boolean } {
  const amount = formatCents(s.amountCents);
  if (s.toUserId === myUserId) return { text: `${s.fromName} says they paid you ${amount}`, needsMyAnswer: true };
  if (s.fromUserId === myUserId) {
    return { text: `You paid ${s.toName} ${amount} · waiting for ${s.toName} to confirm`, needsMyAnswer: false };
  }
  return { text: `${s.fromName} paid ${s.toName} ${amount} · pending`, needsMyAnswer: false };
}
