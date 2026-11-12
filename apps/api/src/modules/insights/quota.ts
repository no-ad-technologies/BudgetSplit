export interface QuotaLimits {
  /** Model calls one member may trigger per window. */
  perUser: number;
  /** Model calls one group may trigger per window, whoever asks. */
  perGroup: number;
  windowMs: number;
  /** Model calls the whole service may make per UTC day: a hard ceiling on what an attack can cost. */
  perDay: number;
}

export const DEFAULT_QUOTA: QuotaLimits = { perUser: 5, perGroup: 10, windowMs: 10 * 60_000, perDay: 500 };

export type QuotaDecision = "allowed" | "user_limit" | "group_limit" | "daily_budget";

interface Counter {
  startedAt: number;
  count: number;
}

/**
 * Decides whether one more paid model call may be made (threat model: denial of service by running up
 * the LLM bill). Only calls that actually reach the model are counted; cached summaries are free.
 * In memory, like the request rate limiter (ADR 0008), and for the same single-instance reason.
 */
export class SummaryQuota {
  private readonly users = new Map<string, Counter>();
  private readonly groups = new Map<string, Counter>();
  private day = { index: -1, count: 0 };

  constructor(
    private readonly limits: QuotaLimits = DEFAULT_QUOTA,
    private readonly now: () => number = Date.now,
  ) {}

  /** Checks all three limits and, only if every one has room, counts the call against each. */
  tryConsume(userId: string, groupId: string): QuotaDecision {
    const at = this.now();
    const dayIndex = Math.floor(at / 86_400_000);
    if (this.day.index !== dayIndex) this.day = { index: dayIndex, count: 0 };

    const user = this.current(this.users, userId, at);
    const group = this.current(this.groups, groupId, at);
    if (user.count >= this.limits.perUser) return "user_limit";
    if (group.count >= this.limits.perGroup) return "group_limit";
    if (this.day.count >= this.limits.perDay) return "daily_budget";

    user.count += 1;
    group.count += 1;
    this.day.count += 1;
    return "allowed";
  }

  private current(map: Map<string, Counter>, key: string, at: number): Counter {
    let counter = map.get(key);
    if (!counter || at - counter.startedAt >= this.limits.windowMs) {
      if (map.size >= 10_000) {
        for (const [k, c] of map) if (at - c.startedAt >= this.limits.windowMs) map.delete(k);
        if (map.size >= 10_000) map.clear();
      }
      counter = { startedAt: at, count: 0 };
      map.set(key, counter);
    }
    return counter;
  }
}
