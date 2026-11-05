import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { REJECT_REASON_MAX_LENGTH, type BalancesDto, type SettlementDto } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";
import { describePending } from "../screens/settleUpText";
import { colors } from "../theme";

export interface PendingSettlementsCardProps {
  groupId: string;
  pending: readonly SettlementDto[];
  myUserId: string;
  onBalancesChanged: (balances: BalancesDto) => void;
}

/**
 * Payments waiting for the receiver (US-07). The receiver can Confirm (balances change) or Reject with a
 * reason (nothing changes). Everyone else sees them as pending. Hidden when nothing is pending.
 */
export function PendingSettlementsCard({ groupId, pending, myUserId, onBalancesChanged }: PendingSettlementsCardProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0) return null;

  const respond = async (settlementId: string, action: "confirm" | "reject") => {
    setBusyId(settlementId);
    setError(null);
    try {
      const res =
        action === "confirm"
          ? await api.confirmSettlement(groupId, settlementId)
          : await api.rejectSettlement(groupId, settlementId, reason);
      setRejectingId(null);
      setReason("");
      onBalancesChanged(res.balances);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your answer. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Waiting for confirmation</Text>
      {pending.map((s) => {
        const { text, needsMyAnswer } = describePending(s, myUserId);
        const busy = busyId === s.id;
        return (
          <View key={s.id} style={styles.item}>
            <Text style={[styles.text, needsMyAnswer && styles.needsAnswer]}>{text}</Text>
            {needsMyAnswer && rejectingId !== s.id && (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.confirmButton, busy && styles.disabled]}
                  onPress={() => void respond(s.id, "confirm")}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Confirm</Text>}
                </Pressable>
                <Pressable
                  style={styles.rejectButton}
                  onPress={() => setRejectingId(s.id)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
              </View>
            )}
            {rejectingId === s.id && (
              <View style={styles.rejectBox}>
                <TextInput
                  style={styles.input}
                  placeholder="Why? e.g. Didn't arrive on Venmo"
                  placeholderTextColor={colors.quiet}
                  value={reason}
                  onChangeText={setReason}
                  maxLength={REJECT_REASON_MAX_LENGTH}
                  accessibilityLabel="Reason for rejecting"
                />
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.rejectButton, (busy || reason.trim() === "") && styles.disabled]}
                    onPress={() => void respond(s.id, "reject")}
                    disabled={busy || reason.trim() === ""}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rejectText}>Send rejection</Text>
                  </Pressable>
                  <Pressable onPress={() => setRejectingId(null)} accessibilityRole="button">
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  item: { gap: 8 },
  text: { fontSize: 15, color: colors.quiet },
  needsAnswer: { color: colors.ink, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  confirmButton: { backgroundColor: colors.owed, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, minWidth: 96, alignItems: "center" },
  confirmText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  rejectButton: { borderWidth: 1, borderColor: colors.owes, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  rejectText: { color: colors.owes, fontSize: 14, fontWeight: "600" },
  cancelText: { color: colors.quiet, fontSize: 14 },
  rejectBox: { gap: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: colors.ink },
  disabled: { opacity: 0.5 },
  errorText: { color: colors.owes, fontSize: 14 },
});
