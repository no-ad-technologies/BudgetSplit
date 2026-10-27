import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeNet, type GroupSummaryDto } from "@budgetsplit/shared";
import { api } from "../api/client";
import { DEV_USER_ID } from "../config";

export function HomeScreen({ onOpenGroup }: { onOpenGroup?: (groupId: string) => void } = {}) {
  const [groups, setGroups] = useState<GroupSummaryDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getMyGroups();
      setGroups(res.groups);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load groups.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!groups) {
    return (
      <View style={styles.centered}>
        {loadError ? (
          <>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void load()}>
              <Text style={styles.secondaryButtonText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>BudgetSplit</Text>
      <Text style={styles.subtitle}>Your balances across all groups</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Groups</Text>
        {groups.length === 0 ? (
          <Text style={styles.hint}>You are not in any groups yet.</Text>
        ) : (
          groups.map((g) => (
            <Pressable
              key={g.groupId}
              style={styles.groupRow}
              onPress={() => onOpenGroup?.(g.groupId)}
              accessibilityRole="button"
            >
              <Text style={styles.groupName}>{g.groupName}</Text>
              <Text
                style={[
                  styles.net,
                  g.netCents > 0 ? styles.owed : g.netCents < 0 ? styles.owes : styles.even,
                ]}
              >
                {describeNet(g.netCents)}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const colors = {
  ink: "#1c1b1f",
  quiet: "#5f5d66",
  line: "#e3e1e8",
  surface: "#ffffff",
  page: "#f6f5f8",
  accent: "#2f5bd3",
  owed: "#1b7f4b",
  owes: "#b3261e",
};

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.quiet, marginTop: -8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet },
  groupRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  groupName: { fontSize: 16, color: colors.ink },
  net: { fontSize: 16, fontWeight: "600" },
  owed: { color: colors.owed },
  owes: { color: colors.owes },
  even: { color: colors.quiet },
  errorText: { color: colors.owes, fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
