import { useCallback, useEffect, useState } from "react";
import type { BalancesDto, GroupDto, SettleUpDto, SettlementDto } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";

export interface GroupData {
  group: GroupDto | null;
  balances: BalancesDto | null;
  /** Fewest payments to settle up (US-06). Always fetched from the server; the phone does no money math. */
  settleUp: SettleUpDto | null;
  /** Settlements waiting for the receiver to confirm or reject (US-07). */
  pending: SettlementDto[] | null;
  loadError: string | null;
  refreshing: boolean;
  /** Re-fetches the group, its balances and its settle-up plan (retry button and pull-to-refresh). */
  reload: () => Promise<void>;
  onRefresh: () => Promise<void>;
  /**
   * After any write (expense or settlement): show the balances the server returned at once, then refresh
   * the plan and the pending list in the background.
   */
  onBalancesChanged: (balances: BalancesDto) => void;
}

/**
 * Owns all the fetching and state behind the group screen (US-05, US-06, US-07), keeping the screen itself
 * presentational. Swap the api client or add caching here without touching the UI.
 */
export function useGroupData(groupId: string): GroupData {
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [balances, setBalances] = useState<BalancesDto | null>(null);
  const [settleUp, setSettleUp] = useState<SettleUpDto | null>(null);
  const [pending, setPending] = useState<SettlementDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [g, b, s, p] = await Promise.all([
        api.getGroup(groupId),
        api.getBalances(groupId),
        api.getSettleUp(groupId),
        api.getPendingSettlements(groupId),
      ]);
      setGroup(g);
      setBalances(b);
      setSettleUp(s);
      setPending(p.settlements);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load the group.");
    }
  }, [groupId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const onBalancesChanged = useCallback(
    (next: BalancesDto) => {
      setBalances(next);
      // Keep what's on screen if a background refresh fails; pull-to-refresh will try again.
      api.getSettleUp(groupId).then(setSettleUp, () => {});
      api.getPendingSettlements(groupId).then((p) => setPending(p.settlements), () => {});
    },
    [groupId],
  );

  return { group, balances, settleUp, pending, loadError, refreshing, reload, onRefresh, onBalancesChanged };
}
