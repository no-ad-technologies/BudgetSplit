import { INVITE_LINK_PREFIX, type CreatedInviteDto } from "@budgetsplit/shared";

const TOKEN = /^[A-Za-z0-9_-]{24}$/;

/**
 * Reads what someone pasted into "Join a group" (US-02): the full budgetsplit://join/<token> link or just
 * the 24-character code. Returns the token, or null if it can't be one.
 */
export function parseInviteInput(text: string): string | null {
  const trimmed = text.trim();
  const token = trimmed.startsWith(INVITE_LINK_PREFIX) ? trimmed.slice(INVITE_LINK_PREFIX.length) : trimmed;
  return TOKEN.test(token) ? token : null;
}

/** "Tue, Nov 10": the day an invite stops working, in the phone's time zone. */
export function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** The text the Share sheet sends to roommates. */
export function inviteShareMessage(groupName: string, invite: Pick<CreatedInviteDto, "url" | "token" | "expiresAt">): string {
  return (
    `Join "${groupName}" on BudgetSplit: ${invite.url}\n` +
    `Or open BudgetSplit, tap "Join a group" and paste this code: ${invite.token}\n` +
    `The link works until ${formatExpiry(invite.expiresAt)}.`
  );
}
