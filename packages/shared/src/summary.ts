import type { MemberContributionDto } from "./types";

/** Alias for the nth member in join order: Member A … Member Z, Member AA, Member AB … (US-11, ADR 0005). */
export function memberAlias(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`Invalid member index ${index}`);
  let letters = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
  }
  return `Member ${letters}`;
}

/**
 * Swaps the aliases in a model-written summary back to display names, on the phone, after the response
 * (ADR 0005: names never reach the model). Whole aliases only, so "Member A" never matches inside
 * "Member AB". The result is plain text; show it in a Text component, never as markup.
 */
export function withMemberNames(summary: string, members: readonly Pick<MemberContributionDto, "alias" | "displayName">[]): string {
  const names = new Map(members.map((m) => [m.alias, m.displayName]));
  return summary.replace(/\bMember [A-Z]{1,2}\b/g, (alias) => names.get(alias) ?? alias);
}
