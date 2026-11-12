import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatCents, SUMMARY_WINDOW_DAYS, type FairnessSummaryDto, type SummaryWindowDays } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";
import { describeSummary } from "../screens/summaryText";
import { colors } from "../theme";

/**
 * Contribution summary (US-11): who paid what over the last 30 or 90 days, with a short neutral summary
 * written by an AI model from those numbers. Loaded only when a member asks, because each new summary is
 * a paid model call. The numbers come from the server and are shown whether or not the model answered.
 * The model's text is rendered as plain text.
 */
export function FairnessSummaryCard({ groupId }: { groupId: string }) {
  const [result, setResult] = useState<FairnessSummaryDto | null>(null);
  const [loadingDays, setLoadingDays] = useState<SummaryWindowDays | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (days: SummaryWindowDays) => {
    setLoadingDays(days);
    setError(null);
    try {
      setResult(await api.getSummary(groupId, days));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the summary.");
    } finally {
      setLoadingDays(null);
    }
  };

  const view = result ? describeSummary(result) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Contribution summary</Text>
      <Text style={styles.hint}>Who paid for the group's expenses, in plain words.</Text>

      <View style={styles.buttons}>
        {SUMMARY_WINDOW_DAYS.map((days) => (
          <Pressable
            key={days}
            style={[styles.button, result?.days === days && styles.buttonActive, loadingDays !== null && styles.disabled]}
            onPress={() => void load(days)}
            disabled={loadingDays !== null}
            accessibilityRole="button"
            accessibilityLabel={`Summarize the last ${days} days`}
          >
            {loadingDays === days ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.buttonText}>Last {days} days</Text>
            )}
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {result && view && (
        <>
          {view.text && (
            <View style={styles.summaryBox}>
              <Text style={styles.summary}>{view.text}</Text>
              <Text style={styles.hint}>Written by AI from the numbers below. It only sees totals, not names or purchases.</Text>
            </View>
          )}
          {view.notice && <Text style={styles.notice}>{view.notice}</Text>}

          {view.showNumbers && (
            <View>
              <View style={styles.row}>
                <Text style={[styles.name, styles.head]}>
                  {result.expenseCount} {result.expenseCount === 1 ? "expense" : "expenses"} · {formatCents(result.totalCents)}
                </Text>
                <Text style={[styles.amount, styles.head]}>Paid</Text>
                <Text style={[styles.amount, styles.head]}>Own share</Text>
              </View>
              {result.members.map((m) => (
                <View key={m.userId} style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  <Text style={styles.amount}>{formatCents(m.paidCents)}</Text>
                  <Text style={styles.amount}>{formatCents(m.shareCents)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet },
  buttons: { flexDirection: "row", gap: 8 },
  button: { flex: 1, borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  buttonActive: { backgroundColor: "#eaf0fd" },
  buttonText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  summaryBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12, gap: 6 },
  summary: { fontSize: 15, lineHeight: 21, color: colors.ink },
  notice: { fontSize: 14, color: colors.quiet },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 8 },
  name: { flex: 1, fontSize: 15, color: colors.ink },
  amount: { width: 84, textAlign: "right", fontSize: 15, color: colors.ink },
  head: { fontSize: 13, color: colors.quiet, fontWeight: "600" },
  errorText: { color: colors.owes, fontSize: 14 },
});
