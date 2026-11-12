import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MeDto } from "@budgetsplit/shared";
import { api, ApiError, configureApiAuth } from "../api/client";
import { AUTH_MODE, FIREBASE_API_KEY } from "../config";
import { createFirebaseRest } from "./firebaseRest";
import { secureTokenStorage } from "./secureStorage";
import { Session } from "./session";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  /** Signed in on this device, but the API couldn't be reached to load the account. */
  | { status: "offline"; message: string }
  | { status: "signedIn"; me: MeDto };

export interface AuthValue {
  state: AuthState;
  /** False in dev mode, where there is no account to sign in to or out of. */
  canSignOut: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** One session per app. Null in dev mode (no Firebase key configured). */
const session =
  AUTH_MODE === "firebase" && FIREBASE_API_KEY
    ? new Session(createFirebaseRest({ apiKey: FIREBASE_API_KEY }), secureTokenStorage)
    : null;

/**
 * Owns who is signed in (US-01). Screens below it read `useMe()` and never see tokens.
 * In dev mode it skips sign-in and asks the API who the X-User-Id header belongs to.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const loadMe = useCallback(async () => {
    try {
      setState({ status: "signedIn", me: await api.getMe() });
    } catch (err) {
      // A 401 has already sent us to the sign-in screen through onUnauthorized.
      if (err instanceof ApiError && err.status === 401) return;
      setState({ status: "offline", message: err instanceof ApiError ? err.message : "Couldn't load your account." });
    }
  }, []);

  const signOut = useCallback(async () => {
    await session?.signOut();
    setState(session ? { status: "signedOut" } : { status: "loading" });
  }, []);

  const start = useCallback(async () => {
    setState({ status: "loading" });
    if (!session) return loadMe();
    if (!(await session.restore())) return setState({ status: "signedOut" });
    await loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (session) {
      configureApiAuth({
        headers: async (): Promise<Record<string, string>> => {
          const token = await session.getIdToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        onUnauthorized: () => void signOut(),
      });
    }
    void start();
  }, [start, signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      state,
      canSignOut: session !== null,
      signIn: async (email, password) => {
        if (!session) return;
        await session.signIn(email, password);
        await loadMe();
      },
      signUp: async (displayName, email, password) => {
        if (!session) return;
        await session.signUp(displayName, email, password);
        await loadMe();
      },
      signOut,
      retry: start,
    }),
    [state, loadMe, signOut, start],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** The signed-in member. Only call from screens that App renders after sign-in. */
export function useMe(): MeDto {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("useMe needs a signed-in user");
  return state.me;
}
