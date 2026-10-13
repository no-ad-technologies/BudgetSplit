import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { describeNet, formatCents, type BalancesDto, type GroupDto } from "@budgetsplit/shared";
import { api, ApiError, newIdempotencyKey } from "../api/client";
import { DEV_USER_ID, GROUP_ID } from "../config";
import { validateDraft, type DraftResult } from "./expenseDraft";

type FieldError = Extract<DraftResult, { ok: false }>;

/**
 * Walking skeleton screen: see the group's balances (US-05) and add an evenly split expense (US-03).
 * All money math happens on the server; this screen only collects input and draws the result.
 */
export function GroupScreen() {
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [balances, setBalances] = useState<BalancesDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [paidById, setPaidById] = useState(DEV_USER_ID);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Same key for every retry of this draft; a fresh one after a successful save.
  const draftKey = useRef(newIdempotencyKey());

  const load = useCallback(async () => {
    try {
      const [g, b] = await Promise.all([api.getGroup(GROUP_ID), api.getBalances(GROUP_ID)]);
      setGroup(g);
      setBalances(b);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load the group.");
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

  const onSave = useCallback(async () => {
    setSaveError(null);
    setLastSaved(null);
    const result = validateDraft({ description, amountText, paidById });
    if (!result.ok) {
      setFieldError(result);
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const response = await api.addExpense(GROUP_ID, result.request, draftKey.current);
      setBalances(response.balances);
      const each = response.expense.shares[0]?.shareCents ?? 0;
      setLastSaved(
        `Saved ${response.expense.description}: ${formatCents(response.expense.amountCents)}, about ${formatCents(each)} each.`,
      );
      setDescription("");
      setAmountText("");
      draftKey.current = newIdempotencyKey();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [description, amountText, paidById]);

  if (!group || !balances) {
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Balances</Text>
          {balances.balances.map((b) => (
            <View key={b.userId} style={styles.balanceRow}>
              <Text style={styles.memberName}>{b.displayName}</Text>
              <Text style={[styles.net, b.netCents > 0 ? styles.owed : b.netCents < 0 ? styles.owes : styles.even]}>
                {describeNet(b.netCents)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add an expense</Text>
          <Text style={styles.hint}>Split evenly between all {group.members.length} members.</Text>

          <TextInput
            style={[styles.input, fieldError?.field === "description" && styles.inputError]}
            placeholder="What was it for?"
            placeholderTextColor={colors.quiet}
            value={description}
            onChangeText={setDescription}
            maxLength={80}
            returnKeyType="next"
            accessibilityLabel="Expense description"
          />
          <TextInput
            style={[styles.input, fieldError?.field === "amount" && styles.inputError]}
            placeholder="Amount, e.g. 50.00"
            placeholderTextColor={colors.quiet}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            accessibilityLabel="Expense amount in dollars"
          />

          <Text style={styles.label}>Paid by</Text>
          <View style={styles.chips}>
            {group.members.map((m) => {
              const selected = m.userId === paidById;
              return (
                <Pressable
                  key={m.userId}
                  onPress={() => setPaidById(m.userId)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{m.displayName}</Text>
                </Pressable>
              );
            })}
          </View>

          {fieldError && <Text style={styles.errorText}>{fieldError.message}</Text>}
          {saveError && <Text style={styles.errorText}>{saveError}</Text>}
          {lastSaved && <Text style={styles.successText}>{lastSaved}</Text>}

          <Pressable
            style={[styles.primaryButton, saving && styles.buttonDisabled]}
            onPress={() => void onSave()}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save expense</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  flex: { flex: 1, backgroundColor: colors.page },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.quiet, marginTop: -8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet, marginTop: -4 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  memberName: { fontSize: 16, color: colors.ink },
  net: { fontSize: 16, fontWeight: "600" },
  owed: { color: colors.owed },
  owes: { color: colors.owes },
  even: { color: colors.quiet },
  label: { fontSize: 13, color: colors.quiet, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.owes },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 15, color: colors.ink },
  chipTextSelected: { color: "#ffffff", fontWeight: "600" },
  errorText: { color: colors.owes, fontSize: 14 },
  successText: { color: colors.owed, fontSize: 14 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
  secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
