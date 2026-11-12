import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { formatCents, type BalancesDto, type MemberDto } from "@budgetsplit/shared";
import { api, ApiError, newIdempotencyKey } from "../api/client";
import { useMe } from "../auth/AuthContext";
import { splitProgress, validateDraft, type DraftResult, type SplitMode } from "../screens/expenseDraft";
import { colors } from "../theme";

type FieldError = Extract<DraftResult, { ok: false }>;

export interface ExpenseFormProps {
  groupId: string;
  members: readonly MemberDto[];
  /** Called with fresh balances after a successful save so the parent can redraw the balance list. */
  onExpenseSaved: (balances: BalancesDto) => void;
}

const SPLIT_MODES: { mode: SplitMode; label: string }[] = [
  { mode: "EVEN", label: "Evenly" },
  { mode: "PERCENT", label: "By %" },
  { mode: "EXACT", label: "Amounts" },
];

/**
 * The "add an expense" form (US-03, US-04): collects a description, amount, payer and how to split it,
 * validates the draft locally, then posts it. For percent and custom splits it shows what is left to
 * assign and keeps Save disabled until the shares add up. Only the resulting balances leave the form.
 */
export function ExpenseForm({ groupId, members, onExpenseSaved }: ExpenseFormProps) {
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const myUserId = useMe().id;
  const [paidById, setPaidById] = useState(myUserId);
  const [splitMode, setSplitMode] = useState<SplitMode>("EVEN");
  const [shareText, setShareText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Same key for every retry of this draft; a fresh one after a successful save.
  const draftKey = useRef(newIdempotencyKey());

  const progress = useMemo(
    () => splitProgress({ description, amountText, paidById, splitMode, shareText }),
    [description, amountText, paidById, splitMode, shareText],
  );

  const chooseMode = (mode: SplitMode) => {
    setSplitMode(mode);
    setShareText({});
    setFieldError(null);
  };

  const onSave = useCallback(async () => {
    setSaveError(null);
    setLastSaved(null);
    const result = validateDraft({ description, amountText, paidById, splitMode, shareText });
    if (!result.ok) {
      setFieldError(result);
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const response = await api.addExpense(groupId, result.request, draftKey.current);
      onExpenseSaved(response.balances);
      const mine = response.expense.shares.find((s) => s.userId === myUserId)?.shareCents ?? 0;
      setLastSaved(
        `Saved ${response.expense.description}: ${formatCents(response.expense.amountCents)}. Your share: ${formatCents(mine)}.`,
      );
      setDescription("");
      setAmountText("");
      setShareText({});
      draftKey.current = newIdempotencyKey();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [description, amountText, paidById, splitMode, shareText, groupId, onExpenseSaved]);

  const hint =
    splitMode === "EVEN"
      ? `Split evenly between all ${members.length} members.`
      : splitMode === "PERCENT"
        ? "Enter each person's percentage. Leave someone blank to leave them out."
        : "Enter each person's amount. Leave someone blank to leave them out.";
  const canSave = !saving && progress.complete;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add an expense</Text>
      <Text style={styles.hint}>{hint}</Text>

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
        {members.map((m) => {
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

      <Text style={styles.label}>Split</Text>
      <View style={styles.chips}>
        {SPLIT_MODES.map(({ mode, label }) => {
          const selected = mode === splitMode;
          return (
            <Pressable
              key={mode}
              onPress={() => chooseMode(mode)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {splitMode !== "EVEN" && (
        <View style={styles.shareList}>
          {members.map((m) => (
            <View key={m.userId} style={styles.shareRow}>
              <Text style={styles.shareName}>{m.displayName}</Text>
              <Text style={styles.affix}>{splitMode === "EXACT" ? "$" : ""}</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.shareInput,
                  progress.invalidMemberIds.includes(m.userId) && styles.inputError,
                ]}
                placeholder={splitMode === "EXACT" ? "0.00" : "0"}
                placeholderTextColor={colors.quiet}
                value={shareText[m.userId] ?? ""}
                onChangeText={(text) => setShareText((prev) => ({ ...prev, [m.userId]: text }))}
                keyboardType="decimal-pad"
                accessibilityLabel={`${m.displayName}'s ${splitMode === "EXACT" ? "amount in dollars" : "percentage"}`}
              />
              <Text style={styles.affix}>{splitMode === "PERCENT" ? "%" : ""}</Text>
            </View>
          ))}
          <Text style={[styles.progress, progress.complete && styles.progressDone]}>{progress.message}</Text>
        </View>
      )}

      {fieldError && <Text style={styles.errorText}>{fieldError.message}</Text>}
      {saveError && <Text style={styles.errorText}>{saveError}</Text>}
      {lastSaved && <Text style={styles.successText}>{lastSaved}</Text>}

      <Pressable
        style={[styles.primaryButton, !canSave && styles.buttonDisabled]}
        onPress={() => void onSave()}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save expense</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet, marginTop: -4 },
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
  shareList: { gap: 8 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  shareName: { flex: 1, fontSize: 15, color: colors.ink },
  shareInput: { width: 110, textAlign: "right" },
  affix: { width: 14, fontSize: 15, color: colors.quiet, textAlign: "center" },
  progress: { fontSize: 14, color: colors.quiet },
  progressDone: { color: colors.owed },
  errorText: { color: colors.owes, fontSize: 14 },
  successText: { color: colors.owed, fontSize: 14 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
});
