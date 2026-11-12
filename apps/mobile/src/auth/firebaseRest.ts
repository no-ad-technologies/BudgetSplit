/**
 * The four Firebase Authentication REST calls the app needs (US-01, ADR 0007): create an account, sign in,
 * set the display name, and trade a refresh token for a fresh ID token.
 *
 * Plain fetch instead of the Firebase SDK: it works in Expo Go with no native setup, and this file has no
 * React Native imports, so it is unit-tested with a fake fetch.
 */

/** What the app holds for a signed-in user. Only the refresh token is ever written to the device. */
export interface Tokens {
  idToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which the ID token stops being accepted (Firebase issues them for one hour). */
  expiresAt: number;
}

/** Firebase refused the request (wrong password, expired refresh token…). `message` is safe to show. */
export class FirebaseAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FirebaseAuthError";
  }
}

/** The request never got an answer (offline, timeout). The session is still good; try again later. */
export class FirebaseNetworkError extends Error {
  constructor() {
    super("Can't reach the sign-in service. Check your connection and try again.");
    this.name = "FirebaseNetworkError";
  }
}

/** Refresh tokens that Firebase will never accept again: the user must sign in again. */
const DEAD_SESSION_CODES = new Set([
  "TOKEN_EXPIRED",
  "INVALID_REFRESH_TOKEN",
  "USER_DISABLED",
  "USER_NOT_FOUND",
  "INVALID_GRANT_TYPE",
  "MISSING_REFRESH_TOKEN",
]);

export function isDeadSession(err: unknown): boolean {
  return err instanceof FirebaseAuthError && DEAD_SESSION_CODES.has(err.code);
}

/**
 * Turns Firebase's error codes into something a person can act on. A wrong email and a wrong password
 * get the same sentence on purpose, so the form can't be used to find out who has an account.
 */
export function friendlyAuthMessage(code: string): string {
  if (code === "EMAIL_EXISTS") return "That email already has an account. Sign in instead.";
  if (code === "INVALID_EMAIL") return "That doesn't look like an email address.";
  if (code === "WEAK_PASSWORD") return "Choose a longer password.";
  if (code === "USER_DISABLED") return "This account has been disabled.";
  if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "INVALID_LOGIN_CREDENTIALS" || code === "INVALID_PASSWORD" || code === "EMAIL_NOT_FOUND") {
    return "Email or password is incorrect.";
  }
  if (DEAD_SESSION_CODES.has(code)) return "Your session has ended. Sign in again.";
  return "Couldn't sign in. Try again.";
}

export interface FirebaseRestOptions {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export interface FirebaseRest {
  signUp(email: string, password: string): Promise<Tokens>;
  signIn(email: string, password: string): Promise<Tokens>;
  /** Sets the name other members see. Call refresh() afterwards so the ID token carries it. */
  setDisplayName(idToken: string, displayName: string): Promise<void>;
  refresh(refreshToken: string): Promise<Tokens>;
}

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN = "https://securetoken.googleapis.com/v1/token";

export function createFirebaseRest({ apiKey, fetch: doFetch = fetch, now = Date.now, timeoutMs = 15_000 }: FirebaseRestOptions): FirebaseRest {
  const key = encodeURIComponent(apiKey);

  async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${url}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new FirebaseNetworkError();
    } finally {
      clearTimeout(timer);
    }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) {
      // Firebase sends { error: { message: "CODE" } } or "CODE : details".
      const raw = (json?.error as { message?: unknown } | undefined)?.message;
      const code = typeof raw === "string" ? (raw.split(" ")[0] ?? "UNKNOWN") : "UNKNOWN";
      throw new FirebaseAuthError(code, friendlyAuthMessage(code));
    }
    return json;
  }

  function toTokens(idToken: unknown, refreshToken: unknown, expiresIn: unknown): Tokens {
    const seconds = Number(expiresIn);
    if (typeof idToken !== "string" || typeof refreshToken !== "string" || !idToken || !refreshToken || !(seconds > 0)) {
      throw new FirebaseAuthError("UNKNOWN", friendlyAuthMessage("UNKNOWN"));
    }
    return { idToken, refreshToken, expiresAt: now() + seconds * 1000 };
  }

  return {
    async signUp(email, password) {
      const r = await post(`${IDENTITY}/accounts:signUp`, { email, password, returnSecureToken: true });
      return toTokens(r.idToken, r.refreshToken, r.expiresIn);
    },
    async signIn(email, password) {
      const r = await post(`${IDENTITY}/accounts:signInWithPassword`, { email, password, returnSecureToken: true });
      return toTokens(r.idToken, r.refreshToken, r.expiresIn);
    },
    async setDisplayName(idToken, displayName) {
      await post(`${IDENTITY}/accounts:update`, { idToken, displayName, returnSecureToken: false });
    },
    async refresh(refreshToken) {
      const r = await post(SECURE_TOKEN, { grant_type: "refresh_token", refresh_token: refreshToken });
      return toTokens(r.id_token, r.refresh_token, r.expires_in);
    },
  };
}
