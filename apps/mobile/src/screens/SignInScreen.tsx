import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { FirebaseAuthError, FirebaseNetworkError } from "../auth/firebaseRest";
import { checkAuthForm, MIN_PASSWORD_LENGTH, type AuthFormMode } from "../auth/signInForm";
import { colors } from "../theme";

/**
 * Sign in or create an account with email and password (US-01). The password goes straight to Firebase
 * over HTTPS; our API never sees it, only the signed token Firebase returns.
 */
export function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthFormMode>("signIn");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = checkAuthForm({ mode, displayName, email, password });

  const submit = async () => {
    if (check.problem) return setError(check.problem);
    setBusy(true);
    setError(null);
    try {
      if (mode === "signUp") await signUp(check.displayName, check.email, password);
      else await signIn(check.email, password);
    } catch (err) {
      setError(
        err instanceof FirebaseAuthError || err instanceof FirebaseNetworkError
          ? err.message
          : "Couldn't sign in. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "signIn" ? "signUp" : "signIn");
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>BudgetSplit</Text>
        <Text style={styles.subtitle}>
          {mode === "signIn" ? "Sign in to see your groups and balances." : "Create an account to start splitting."}
        </Text>

        <View style={styles.card}>
          {mode === "signUp" && (
            <TextInput
              style={styles.input}
              placeholder="Your name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={60}
              accessibilityLabel="Your name"
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Email"
          />
          <TextInput
            style={styles.input}
            placeholder={mode === "signUp" ? `Password (at least ${MIN_PASSWORD_LENGTH} characters)` : "Password"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            onSubmitEditing={() => void submit()}
            accessibilityLabel="Password"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[styles.button, busy && styles.disabled]}
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === "signIn" ? "Sign in" : "Create account"}</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={switchMode} disabled={busy} accessibilityRole="button">
          <Text style={styles.link}>
            {mode === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, paddingTop: 96, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.quiet, marginTop: -8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  errorText: { color: colors.owes, fontSize: 14 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600", textAlign: "center" },
});
