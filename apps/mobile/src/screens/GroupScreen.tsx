import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BalanceList } from "../components/BalanceList";
import { ExpenseForm } from "../components/ExpenseForm";
import { InviteCard } from "../components/InviteCard";
import { PendingSettlementsCard } from "../components/PendingSettlementsCard";
import { SettleUpCard } from "../components/SettleUpCard";
import { useMe } from "../auth/AuthContext";
import { GROUP_ID } from "../config";
import { useGroupData } from "../hooks/useGroupData";
import { colors } from "../theme";

/**
 * Group screen: balances (US-05), the settle-up plan (US-06), payments waiting for confirmation (US-07)
 * the add-expense form (US-03, US-04) and, for admins, the invite card (US-02).
 * Data fetching lives in useGroupData; the balances and the form are their own components.
 * All money math happens on the server; this screen only lays out the result.
 */
export function GroupScreen({ groupId }: { groupId?: string } = {}) {
  const activeGroupId = groupId ?? GROUP_ID;
  const myUserId = useMe().id;
  const { group, balances, settleUp, pending, loadError, refreshing, reload, onRefresh, onBalancesChanged } =
    useGroupData(activeGroupId);

  if (!group || !balances || !settleUp || !pending) {
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

  const me = group.members.find((m) => m.userId === myUserId);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>{group.name}</Text>
        <Text style={styles.subtitle}>Signed in as {me?.displayName ?? "unknown"}</Text>

        <BalanceList balances={balances.balances} />
        <PendingSettlementsCard
          groupId={activeGroupId}
          pending={pending}
          myUserId={myUserId}
          onBalancesChanged={onBalancesChanged}
        />
        <SettleUpCard
          groupId={activeGroupId}
          plan={settleUp}
          pending={pending}
          myUserId={myUserId}
          onBalancesChanged={onBalancesChanged}
        />
        <ExpenseForm groupId={activeGroupId} members={group.members} onExpenseSaved={onBalancesChanged} />
        {me?.role === "ADMIN" && <InviteCard groupId={activeGroupId} groupName={group.name} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.quiet, marginTop: -8 },
  errorText: { color: colors.owes, fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
