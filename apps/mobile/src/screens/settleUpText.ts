import { formatCents, type SuggestedPaymentDto } from "@budgetsplit/shared";

/** Plain-language line for one suggested payment (US-06), from the signed-in member's point of view. */
export function describePayment(p: SuggestedPaymentDto, myUserId: string): string {
  const amount = formatCents(p.amountCents);
  if (p.fromUserId === myUserId) return `You pay ${p.toName} ${amount}`;
  if (p.toUserId === myUserId) return `${p.fromName} pays you ${amount}`;
  return `${p.fromName} pays ${p.toName} ${amount}`;
}
