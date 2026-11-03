import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { BalancesDto, SettleUpDto, SettlementDto, SuggestedPaymentDto } from "@budgetsplit/shared";
import { api, ApiError, newIdempotencyKey } from "../api/client";
import { describePayment, isAlreadyRecorded } from "../screens/settleUpText";
import { colors } from "../theme";

export interface SettleUpCardProps {
  groupId: string;
  plan: SettleUpDto;
  pending: readonly SettlementDto[];
  /** The signed-in member, so their own payments read "You pay Maya" and get a "Record payment" button. */
  myUserId: string;
  onBalancesChanged: (balances: BalancesDto) => void;
}

/**
 * The settle-up plan (US-06): the fewest payments that bring every balance to $0.00. On their own
 * payments the signed-in member can tap "Record payment" (US-07); it stays Pending until the receiver confirms.
 */
export function SettleUpCard({ groupId, plan, pending, myUserId, onBalancesChanged }: SettleUpCardProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const record = async (p: SuggestedPaymentDto) => {
    const key = `${p.fromUserId}-${p.toUserId}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await api.recordSettlement(groupId, { toUserId: p.toUserId, amountCents: p.amountCents }, newIdempotencyKey());
      onBalancesChanged(res.balances);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record the payment. Try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{plan.exact ? "Fewest payments to settle up" : "Suggested payments"}</Text>
      {plan.payments.length === 0 ? (
        <Text style={styles.hint}>Everyone is settled up.</Text>
      ) : (
        plan.payments.map((p) => {
          const key = `${p.fromUserId}-${p.toUserId}`;
          const mine = p.fromUserId === myUserId;
          const involved = mine || p.toUserId === myUserId;
          const recorded = isAlreadyRecorded(p, pending);
          return (
            <View key={key} style={styles.row}>
              <Text style={[styles.payment, involved && styles.mine]}>{describePayment(p, myUserId)}</Text>
              {mine && recorded && <Text style={styles.pendingTag}>Pending</Text>}
              {mine && !recorded && (
                <Pressable
                  style={[styles.smallButton, busyKey !== null && styles.disabled]}
                  onPress={() => void record(p)}
                  disabled={busyKey !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Record that you paid ${p.toName}`}
                >
                  {busyKey === key ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.smallButtonText}>Record payment</Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })
      )}
      {plan.payments.length > 0 && (
        <Text style={styles.hint}>
          {plan.payments.length === 1 ? "1 payment clears" : `${plan.payments.length} payments clear`} every balance.
          Balances change when the receiver confirms.
        </Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 4 },
  payment: { flex: 1, fontSize: 16, color: colors.ink },
  mine: { fontWeight: "600", color: colors.accent },
  pendingTag: { fontSize: 13, color: colors.quiet, fontWeight: "600" },
  smallButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, minWidth: 130, alignItems: "center" },
  smallButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  errorText: { color: colors.owes, fontSize: 14 },
});
