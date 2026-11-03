import { StyleSheet, Text, View } from "react-native";
import type { SettleUpDto } from "@budgetsplit/shared";
import { describePayment } from "../screens/settleUpText";
import { colors } from "../theme";

export interface SettleUpCardProps {
  plan: SettleUpDto;
  /** The signed-in member, so their own payments read "You pay Maya" and stand out. */
  myUserId: string;
}

/** The settle-up plan (US-06): the fewest payments that bring every balance to $0.00. */
export function SettleUpCard({ plan, myUserId }: SettleUpCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{plan.exact ? "Fewest payments to settle up" : "Suggested payments"}</Text>
      {plan.payments.length === 0 ? (
        <Text style={styles.hint}>Everyone is settled up.</Text>
      ) : (
        plan.payments.map((p) => {
          const mine = p.fromUserId === myUserId || p.toUserId === myUserId;
          return (
            <View key={`${p.fromUserId}-${p.toUserId}`} style={styles.row}>
              <Text style={[styles.payment, mine && styles.mine]}>{describePayment(p, myUserId)}</Text>
            </View>
          );
        })
      )}
      {plan.payments.length > 0 && (
        <Text style={styles.hint}>
          {plan.payments.length === 1 ? "1 payment" : `${plan.payments.length} payments`} clear every balance.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet },
  row: { paddingVertical: 4 },
  payment: { fontSize: 16, color: colors.ink },
  mine: { fontWeight: "600", color: colors.accent },
});
