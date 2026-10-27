import { useCallback, useEffect, useState } from "react";
import type { BalancesDto, GroupDto } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";

export interface GroupData {
  group: GroupDto | null;
  balances: BalancesDto | null;
  loadError: string | null;
  refreshing: boolean;
  /** Re-fetches the group and its balances (used by the retry button and pull-to-refresh). */
  reload: () => Promise<void>;
  onRefresh: () => Promise<void>;
  /** Replaces the balances after a write, so the screen redraws without another round trip. */
  setBalances: (balances: BalancesDto) => void;
}

/**
 * Owns all the fetching and state behind the group screen (US-05), keeping the screen itself
 * presentational. Swap the api client or add caching here without touching the UI.
 */
export function useGroupData(groupId: string): GroupData {
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [balances, setBalances] = useState<BalancesDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [g, b] = await Promise.all([api.getGroup(groupId), api.getBalances(groupId)]);
      setGroup(g);
      setBalances(b);
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

  return { group, balances, loadError, refreshing, reload, onRefresh, setBalances };
}
