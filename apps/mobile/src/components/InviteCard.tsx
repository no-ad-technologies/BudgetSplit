import { useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { CreatedInviteDto } from "@budgetsplit/shared";
import { api, ApiError } from "../api/client";
import { formatExpiry, inviteShareMessage } from "../screens/inviteText";
import { colors } from "../theme";

/**
 * Admin-only card to invite roommates (US-02): makes a 7-day invite link, opens the Share sheet,
 * and can revoke the link early. The code is only shown here, right after it's created.
 */
export function InviteCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [invite, setInvite] = useState<CreatedInviteDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const create = () => attempt(async () => setInvite(await api.createInvite(groupId)));
  const revoke = () =>
    attempt(async () => {
      await api.revokeInvite(groupId, invite!.id);
      setInvite(null);
    });
  const share = () => {
    if (invite) void Share.share({ message: inviteShareMessage(groupName, invite) });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Invite roommates</Text>
      {invite ? (
        <>
          <Text style={styles.hint}>Anyone with this link can join until {formatExpiry(invite.expiresAt)}.</Text>
          <Text selectable style={styles.code}>
            {invite.token}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.button} onPress={share} accessibilityRole="button">
              <Text style={styles.buttonText}>Share link</Text>
            </Pressable>
            <Pressable style={[styles.outline, busy && styles.disabled]} onPress={() => void revoke()} disabled={busy} accessibilityRole="button">
              <Text style={styles.outlineText}>Revoke</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable style={[styles.button, busy && styles.disabled]} onPress={() => void create()} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create invite link</Text>}
        </Pressable>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.quiet },
  code: { fontSize: 16, fontFamily: "monospace", color: colors.ink, backgroundColor: colors.page, padding: 10, borderRadius: 8 },
  row: { flexDirection: "row", gap: 10 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  outline: { borderWidth: 1, borderColor: colors.owes, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  outlineText: { color: colors.owes, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  errorText: { color: colors.owes, fontSize: 14 },
});
