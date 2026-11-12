import { allowedFigures, PROMPT_CANARY } from "./prompt.ts";
import type { ContributionStats } from "./stats.ts";

export const SUMMARY_MAX_CHARS = 700;

/** Why a model answer was thrown away. Logged, and reported by the evaluation script. */
export type RejectionReason =
  | "empty"
  | "too_long"
  | "prompt_leak"
  | "unknown_figure"
  | "unknown_member"
  | "off_topic"
  | "judgemental_wording"
  | "link_or_markup";

export type Verdict = { ok: true; summary: string } | { ok: false; reason: RejectionReason; detail: string };

/**
 * Words that describe a person's character or motives rather than an amount (US-11: "paid 18% less than
 * their share", not "is freeloading"), plus advice. A blunt list on purpose: a false rejection only costs
 * the summary, and the numbers are still shown.
 */
const JUDGEMENT =
  /\b(freeload\w*|mooch\w*|lazy|laziness|cheap(?:skate)?\w*|stingy|selfish\w*|greedy|greed|deadbeat\w*|slack(?:er|ing|s)?|irresponsib\w*|unfair\w*|taking advantage|shame\w*|blame\w*|guilty|should|ought to|must|needs? to)\b/i;

const LEAK = new RegExp(`${PROMPT_CANARY}|system prompt|my (?:instructions|rules)|these rules`, "i");
const MARKUP = /https?:\/\/|www\.|```|<[a-z!/]|\[[^\]]*\]\(/i;

/** Dollar amounts, percentages and bare numbers, e.g. "$1,234.56", "57%", "30". */
const NUMBER = /(\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?%| percent)?/g;

/**
 * Decides whether a model answer may be shown (US-11, ADR 0005). The model's text is untrusted output:
 * it is shown only if every check passes, otherwise the app says "Summary unavailable" and still shows
 * the server's numbers.
 *
 * The figure check is what stops invented numbers, and it is also the last line of defence against
 * prompt injection: an answer that has been steered into saying something else almost never consists
 * only of the group's own figures, aliases and neutral words.
 */
export function validateSummary(raw: string, stats: ContributionStats): Verdict {
  const summary = raw.trim().replace(/\s+/g, " ");
  const fail = (reason: RejectionReason, detail: string): Verdict => ({ ok: false, reason, detail });

  if (!summary) return fail("empty", "");
  if (summary.length > SUMMARY_MAX_CHARS) return fail("too_long", `${summary.length} characters`);

  const leak = LEAK.exec(summary);
  if (leak) return fail("prompt_leak", leak[0]);
  const markup = MARKUP.exec(summary);
  if (markup) return fail("link_or_markup", markup[0]);
  const judgement = JUDGEMENT.exec(summary);
  if (judgement) return fail("judgemental_wording", judgement[0]);

  const allowed = allowedFigures(stats);
  for (const alias of summary.match(/\bMember [A-Z]+\b/g) ?? []) {
    if (!allowed.aliases.has(alias)) return fail("unknown_member", alias);
  }

  let citesAnAmount = false;
  for (const match of summary.matchAll(NUMBER)) {
    const [text, dollar, whole = "", fraction, percent] = match;
    const integer = Number(whole.replace(/,/g, ""));
    if (percent) {
      if (fraction || !allowed.percents.has(integer)) return fail("unknown_figure", text);
    } else if (dollar || fraction) {
      // "$60", "$60.00" and "60.00" all mean 6000 cents; "$60.5" is not how any figure was written.
      if (fraction && fraction.length !== 2) return fail("unknown_figure", text);
      if (!allowed.cents.has(integer * 100 + Number(fraction ?? 0))) return fail("unknown_figure", text);
      citesAnAmount = true;
    } else if (!allowed.counts.has(integer) && !allowed.percents.has(integer) && !allowed.cents.has(integer * 100)) {
      return fail("unknown_figure", text);
    }
  }

  // A real summary of spending states at least one of the group's dollar amounts. Text with none of them
  // ("PWNED", a poem, an apology) is about something else, however harmless it looks.
  if (!citesAnAmount) return fail("off_topic", "no dollar amount from the statistics");

  return { ok: true, summary };
}
