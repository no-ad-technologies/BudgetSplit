import { useCallback, useEffect, useState } from "react";
import type { BalancesDto, GroupDto, SettleUpDto } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";

export interface GroupData {
  group: GroupDto | null;
  balances: BalancesDto | null;
  /** Fewest payments to settle up (US-06). Always fetched from the server; the phone does no money math. */
  settleUp: SettleUpDto | null;
  loadError: string | null;
  refreshing: boolean;
  /** Re-fetches the group, its balances and its settle-up plan (retry button and pull-to-refresh). */
  reload: () => Promise<void>;
  onRefresh: () => Promise<void>;
  /** After a write: show the balances the server returned at once, then refresh the plan in the background. */
  onBalancesChanged: (balances: BalancesDto) => void;
}

/**
 * Owns all the fetching and state behind the group screen (US-05, US-06), keeping the screen itself
 * presentational. Swap the api client or add caching here without touching the UI.
 */
export function useGroupData(groupId: string): GroupData {
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [balances, setBalances] = useState<BalancesDto | null>(null);
  const [settleUp, setSettleUp] = useState<SettleUpDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [g, b, s] = await Promise.all([api.getGroup(groupId), api.getBalances(groupId), api.getSettleUp(groupId)]);
      setGroup(g);
      setBalances(b);
      setSettleUp(s);
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
      api.getSettleUp(groupId).then(setSettleUp, () => {
        // Keep the old plan on screen; pull-to-refresh will try again.
      });
    },
    [groupId],
  );

  return { group, balances, settleUp, loadError, refreshing, reload, onRefresh, onBalancesChanged };
}
