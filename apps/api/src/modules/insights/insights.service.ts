import type { FairnessSummaryDto, FairnessSummaryStatus, SummaryWindowDays } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { logger } from "../../logger.ts";
import type { LlmClient } from "./llm.ts";
import { buildUserMessage, SUMMARY_MAX_TOKENS, SYSTEM_PROMPT } from "./prompt.ts";
import { SummaryQuota } from "./quota.ts";
import { buildStats, type ContributionStats } from "./stats.ts";
import { validateSummary } from "./validate.ts";

/** US-11: the summary appears within 10 seconds or the app shows the numbers without it. */
export const LLM_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const DAY_MS = 86_400_000;

export interface InsightsDeps {
  /** Null when no API key is configured: summaries are "unavailable" and the numbers still work. */
  llm: LlmClient | null;
  quota?: SummaryQuota;
  now?: () => number;
}

/** Reads what each member paid and was responsible for over the last `days` days (US-11). */
export async function getContributionStats(db: Db, groupId: string, days: SummaryWindowDays, now: number): Promise<ContributionStats> {
  const inWindow = { groupId, createdAt: { gte: new Date(now - days * DAY_MS) } };
  const [members, paid, shares, expenseCount] = await Promise.all([
    db.groupMember.findMany({
      where: { groupId },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      select: { userId: true, user: { select: { displayName: true } } },
    }),
    db.expense.groupBy({ by: ["paidById"], where: inWindow, _sum: { amountCents: true } }),
    db.expenseShare.groupBy({ by: ["userId"], where: { expense: inWindow }, _sum: { shareCents: true } }),
    db.expense.count({ where: inWindow }),
  ]);

  const paidBy = new Map(paid.map((row) => [row.paidById, row._sum.amountCents ?? 0]));
  const shareOf = new Map(shares.map((row) => [row.userId, row._sum.shareCents ?? 0]));
  return buildStats(
    days,
    expenseCount,
    members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      paidCents: paidBy.get(m.userId) ?? 0,
      shareCents: shareOf.get(m.userId) ?? 0,
    })),
  );
}

/**
 * Builds summaries for one running API (US-11, ADR 0005). Holds the cache, the in-flight calls and the
 * quota, so create it once per app.
 */
export function createInsightsService(db: Db, { llm, quota = new SummaryQuota(), now = Date.now }: InsightsDeps) {
  /** Keyed by the exact text sent to the model, so a summary is reused until the numbers change. */
  const cache = new Map<string, { summary: string; at: number }>();
  const inFlight = new Map<string, Promise<string | null>>();

  async function askModel(userMessage: string, stats: ContributionStats, groupId: string): Promise<string | null> {
    const started = now();
    try {
      const raw = await llm!.complete({
        system: SYSTEM_PROMPT,
        user: userMessage,
        maxTokens: SUMMARY_MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
      });
      const verdict = validateSummary(raw, stats);
      if (!verdict.ok) {
        // The rejected text is not logged: it is untrusted output and may be long.
        logger.warn({ groupId, reason: verdict.reason, ms: now() - started }, "summary_rejected");
        return null;
      }
      logger.info({ groupId, ms: now() - started }, "summary_ok");
      return verdict.summary;
    } catch (err) {
      logger.warn({ groupId, reason: err instanceof Error ? err.message : "unknown", ms: now() - started }, "summary_failed");
      return null;
    }
  }

  return {
    async getSummary(groupId: string, userId: string, days: SummaryWindowDays): Promise<FairnessSummaryDto> {
      const stats = await getContributionStats(db, groupId, days, now());
      const answer = (status: FairnessSummaryStatus, summary: string | null = null): FairnessSummaryDto => ({
        groupId,
        days,
        expenseCount: stats.expenseCount,
        totalCents: stats.totalCents,
        members: stats.members,
        status,
        summary,
      });

      if (stats.expenseCount === 0) return answer("no_expenses");
      if (!llm) return answer("unavailable");

      const userMessage = buildUserMessage(stats);
      const key = `${groupId}|${userMessage}`;
      const cached = cache.get(key);
      if (cached && now() - cached.at < CACHE_TTL_MS) return answer("ok", cached.summary);

      // Someone else in the group is already waiting for the same summary: share that call.
      let pending = inFlight.get(key);
      if (!pending) {
        const decision = quota.tryConsume(userId, groupId);
        if (decision !== "allowed") {
          logger.warn({ groupId, userId, decision }, "summary_quota");
          return answer(decision === "daily_budget" ? "unavailable" : "limited");
        }
        pending = askModel(userMessage, stats, groupId).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }

      const summary = await pending;
      if (summary === null) return answer("unavailable");

      if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(key, { summary, at: now() });
      return answer("ok", summary);
    },
  };
}

export type InsightsService = ReturnType<typeof createInsightsService>;
