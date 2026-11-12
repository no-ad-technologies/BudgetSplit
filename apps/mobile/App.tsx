import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { GroupScreen } from "./src/screens/GroupScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SignInScreen } from "./src/screens/SignInScreen";

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

/** Nothing below the sign-in gate renders until the API has confirmed who the user is (US-01). */
function Root() {
  const { state, retry, signOut, canSignOut } = useAuth();
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  // Whoever signs in next starts on their own home screen, not on the last person's open group.
  const signedIn = state.status === "signedIn";
  useEffect(() => {
    if (!signedIn) setCurrentGroupId(null);
  }, [signedIn]);

  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (state.status === "signedOut") return <SignInScreen />;

  if (state.status === "offline") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => void retry()}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
        {canSignOut && (
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.backText}>Sign out</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (currentGroupId) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => setCurrentGroupId(null)}>
          <Text style={styles.backText}>← Back to groups</Text>
        </Pressable>
        <View style={styles.screen}>
          <GroupScreen groupId={currentGroupId} />
        </View>
      </View>
    );
  }

  return <HomeScreen onOpenGroup={(groupId) => setCurrentGroupId(groupId)} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f5f8" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: "#f6f5f8" },
  backButton: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 },
  backText: { fontSize: 15, color: "#2f5bd3", fontWeight: "600" },
  screen: { flex: 1 },
  errorText: { color: "#b3261e", fontSize: 14, textAlign: "center" },
  secondaryButton: { borderWidth: 1, borderColor: "#2f5bd3", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryButtonText: { color: "#2f5bd3", fontSize: 15, fontWeight: "600" },
});
