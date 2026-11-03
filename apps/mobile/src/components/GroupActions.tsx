import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../api/client";
import { parseInviteInput } from "../screens/inviteText";
import { colors } from "../theme";

export interface GroupActionsProps {
  /** Called with the new or joined group's id, so the home screen can refresh and open it. */
  onGroupReady: (groupId: string) => void;
}

/** Home-screen cards to start a group or join one from an invite link or code (US-02). */
export function GroupActions({ onGroupReady }: GroupActionsProps) {
  const [name, setName] = useState("");
  const [inviteText, setInviteText] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "create" | "join", action: () => Promise<string>) => {
    setBusy(kind);
    setError(null);
    try {
      onGroupReady(await action());
      setName("");
      setInviteText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const token = parseInviteInput(inviteText);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Start a group</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="e.g. Maple St House"
          placeholderTextColor={colors.quiet}
          value={name}
          onChangeText={setName}
          maxLength={60}
          accessibilityLabel="New group name"
        />
        <Pressable
          style={[styles.button, (busy !== null || name.trim() === "") && styles.disabled]}
          disabled={busy !== null || name.trim() === ""}
          onPress={() => void run("create", async () => (await api.createGroup(name.trim())).id)}
          accessibilityRole="button"
        >
          {busy === "create" ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create</Text>}
        </Pressable>
      </View>

      <Text style={styles.cardTitle}>Join a group</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Paste an invite link or code"
          placeholderTextColor={colors.quiet}
          value={inviteText}
          onChangeText={setInviteText}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Invite link or code"
        />
        <Pressable
          style={[styles.button, (busy !== null || !token) && styles.disabled]}
          disabled={busy !== null || !token}
          onPress={() => void run("join", async () => (await api.acceptInvite(token!)).group.id)}
          accessibilityRole="button"
        >
          {busy === "join" ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join</Text>}
        </Pressable>
      </View>
      {inviteText.trim() !== "" && !token && <Text style={styles.hint}>That doesn't look like an invite code yet.</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, minWidth: 84, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  hint: { fontSize: 13, color: colors.quiet },
  errorText: { color: colors.owes, fontSize: 14 },
});
