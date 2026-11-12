import { withMemberNames, type FairnessSummaryDto } from "@budgetsplit/shared";

export interface SummaryView {
  /** The model's summary with names swapped in for aliases, or null when there is none to show. */
  text: string | null;
  /** A line explaining why there is no summary. Null when `text` is set. */
  notice: string | null;
  /** Whether to show the per-member numbers (always, unless the window had no expenses). */
  showNumbers: boolean;
}

/**
 * Turns the API's answer into what the card shows (US-11). Whatever happened to the model, the member
 * always gets the server's numbers; the AI text is an extra on top of them.
 */
export function describeSummary(dto: FairnessSummaryDto): SummaryView {
  if (dto.status === "no_expenses") {
    return { text: null, notice: `No expenses in the last ${dto.days} days.`, showNumbers: false };
  }
  if (dto.status === "ok" && dto.summary) {
    return { text: withMemberNames(dto.summary, dto.members), notice: null, showNumbers: true };
  }
  if (dto.status === "limited") {
    return { text: null, notice: "Summary limit reached. Try again in a few minutes; the numbers are below.", showNumbers: true };
  }
  return { text: null, notice: "Summary unavailable. The numbers are below.", showNumbers: true };
}
