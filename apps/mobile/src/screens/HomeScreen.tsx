import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeNet } from "@budgetsplit/shared";
import { useAuth, useMe } from "../auth/AuthContext";
import { GroupActions } from "../components/GroupActions";
import { useMyGroups } from "../hooks/useMyGroups";
import { colors, netColor } from "../theme";

/**
 * Home screen: every group the user is in, with their net in each (US-05), plus starting or joining a
 * group (US-02). Data comes from useMyGroups.
 */
export function HomeScreen({ onOpenGroup }: { onOpenGroup?: (groupId: string) => void } = {}) {
  const { groups, loadError, refreshing, reload, onRefresh } = useMyGroups();
  const { signOut, canSignOut } = useAuth();
  const me = useMe();

  if (!groups) {
    return (
      <View style={styles.centered}>
        {loadError ? (
          <>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void reload()}>
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
      <Text style={styles.subtitle}>
        Signed in as {me.displayName} · your balances across all groups
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Groups</Text>
        {groups.length === 0 ? (
          <Text style={styles.hint}>You are not in any groups yet. Start one or join with an invite below.</Text>
        ) : (
          groups.map((g) => (
            <Pressable
              key={g.groupId}
              style={styles.groupRow}
              onPress={() => onOpenGroup?.(g.groupId)}
              accessibilityRole="button"
            >
              <Text style={styles.groupName}>{g.groupName}</Text>
              <Text style={[styles.net, { color: netColor(g.netCents) }]}>{describeNet(g.netCents)}</Text>
            </Pressable>
          ))
        )}
      </View>

      <GroupActions
        onGroupReady={(groupId) => {
          void reload();
          onOpenGroup?.(groupId);
        }}
      />

      {canSignOut && (
        <Pressable style={styles.secondaryButton} onPress={() => void signOut()} accessibilityRole="button">
          <Text style={[styles.secondaryButtonText, styles.centerText]}>Sign out</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

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
  errorText: { color: colors.owes, fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  centerText: { textAlign: "center" },
});
