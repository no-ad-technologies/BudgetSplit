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
import { DEV_USER_ID, GROUP_ID } from "../config";
import { useGroupData } from "../hooks/useGroupData";
import { colors } from "../theme";

/**
 * Walking skeleton screen: see the group's balances (US-05) and add an evenly split expense (US-03).
 * Data fetching lives in useGroupData; the balances and the form are their own components.
 * All money math happens on the server; this screen only lays out the result.
 */
export function GroupScreen() {
  const { group, balances, loadError, refreshing, reload, onRefresh, setBalances } = useGroupData(GROUP_ID);

  if (!group || !balances) {
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

  const me = group.members.find((m) => m.userId === DEV_USER_ID);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>{group.name}</Text>
        <Text style={styles.subtitle}>Signed in as {me?.displayName ?? "unknown"} (dev mode)</Text>

        <BalanceList balances={balances.balances} />
        <ExpenseForm groupId={GROUP_ID} members={group.members} onExpenseSaved={setBalances} />
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
