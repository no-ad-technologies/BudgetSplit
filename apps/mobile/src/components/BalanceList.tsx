import { StyleSheet, Text, View } from "react-native";
import { describeNet, type MemberBalanceDto } from "@budgetsplit/shared";
import { colors } from "../theme";

/** Read-only balances card (US-05): one row per member, colored by whether they owe or are owed. */
export function BalanceList({ balances }: { balances: readonly MemberBalanceDto[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Balances</Text>
      {balances.map((b) => (
        <View key={b.userId} style={styles.balanceRow}>
          <Text style={styles.memberName}>{b.displayName}</Text>
          <Text style={[styles.net, b.netCents > 0 ? styles.owed : b.netCents < 0 ? styles.owes : styles.even]}>
            {describeNet(b.netCents)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  memberName: { fontSize: 16, color: colors.ink },
  net: { fontSize: 16, fontWeight: "600" },
  owed: { color: colors.owed },
  owes: { color: colors.owes },
  even: { color: colors.quiet },
});
