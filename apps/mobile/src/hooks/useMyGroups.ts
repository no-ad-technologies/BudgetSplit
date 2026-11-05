import { useCallback, useEffect, useState } from "react";
import type { GroupSummaryDto } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";

export interface MyGroupsData {
  groups: GroupSummaryDto[] | null;
  loadError: string | null;
  refreshing: boolean;
  reload: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

/** Fetching and state behind the home screen (US-05), mirroring useGroupData for the group screen. */
export function useMyGroups(): MyGroupsData {
  const [groups, setGroups] = useState<GroupSummaryDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await api.getMyGroups();
      setGroups(res.groups);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load groups.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  return { groups, loadError, refreshing, reload, onRefresh };
}
