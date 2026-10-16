import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { formatCents, type BalancesDto, type MemberDto } from "@budgetsplit/shared";
import { api, ApiError, newIdempotencyKey } from "../api/client";
import { DEV_USER_ID } from "../config";
import { validateDraft, type DraftResult } from "../screens/expenseDraft";
import { colors } from "../theme";

type FieldError = Extract<DraftResult, { ok: false }>;

export interface ExpenseFormProps {
  groupId: string;
  members: readonly MemberDto[];
  /** Called with fresh balances after a successful save so the parent can redraw the balance list. */
  onExpenseSaved: (balances: BalancesDto) => void;
}

/**
 * The "add an expense" form (US-03): collects a description, amount and payer, validates the draft
 * locally, then posts it. Owns its own input and error state; only the resulting balances leave.
 */
export function ExpenseForm({ groupId, members, onExpenseSaved }: ExpenseFormProps) {
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [paidById, setPaidById] = useState(DEV_USER_ID);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Same key for every retry of this draft; a fresh one after a successful save.
  const draftKey = useRef(newIdempotencyKey());

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
      const response = await api.addExpense(groupId, result.request, draftKey.current);
      onExpenseSaved(response.balances);
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
  }, [description, amountText, paidById, groupId, onExpenseSaved]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add an expense</Text>
      <Text style={styles.hint}>Split evenly between all {members.length} members.</Text>

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
  errorText: { color: colors.owes, fontSize: 14 },
  successText: { color: colors.owed, fontSize: 14 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
});
