import { type FirebaseRest, isDeadSession, type Tokens } from "./firebaseRest";

/** Where the refresh token lives between app launches. On the phone this is the Keychain / Keystore. */
export interface TokenStorage {
  get(): Promise<string | null>;
  set(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

/** Ask for a new ID token this long before the old one expires, so a request never carries a stale one. */
export const REFRESH_MARGIN_MS = 60_000;

/**
 * The signed-in session on this device (US-01).
 *
 * - The one-hour ID token is kept in memory only. It is what the API sees, and it is never written to disk.
 * - The long-lived refresh token is kept in secure storage, so a stolen backup or another app can't read it.
 * - Sign-out forgets both.
 *
 * No React or Expo imports, so the rules above are unit-tested (session.test.ts).
 */
export class Session {
  private tokens: Tokens | null = null;
  private refreshing: Promise<Tokens | null> | null = null;

  constructor(
    private readonly firebase: FirebaseRest,
    private readonly storage: TokenStorage,
    private readonly now: () => number = Date.now,
  ) {}

  /** App launch: true if this device has a saved session. The ID token itself is fetched on first use. */
  async restore(): Promise<boolean> {
    const refreshToken = await this.storage.get();
    if (!refreshToken) return false;
    this.tokens = { idToken: "", refreshToken, expiresAt: 0 };
    return true;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.adopt(await this.firebase.signIn(email, password));
  }

  /** Creates the account, sets the display name, then refreshes so the ID token carries the name. */
  async signUp(displayName: string, email: string, password: string): Promise<void> {
    const created = await this.firebase.signUp(email, password);
    await this.adopt(created);
    await this.firebase.setDisplayName(created.idToken, displayName);
    await this.adopt(await this.firebase.refresh(created.refreshToken));
  }

  /**
   * The token to send to the API, refreshed when it is about to expire. Returns null when there is no
   * session, or when Firebase says the saved one is dead (signed out elsewhere, account disabled).
   * Throws FirebaseNetworkError when offline: the session is kept, and the caller can retry.
   */
  async getIdToken(): Promise<string | null> {
    const current = this.tokens;
    if (!current) return null;
    if (current.idToken && current.expiresAt - this.now() > REFRESH_MARGIN_MS) return current.idToken;

    // Many requests can start at once; they all wait for the same refresh instead of each sending one.
    this.refreshing ??= this.refreshNow(current.refreshToken).finally(() => {
      this.refreshing = null;
    });
    return (await this.refreshing)?.idToken ?? null;
  }

  async signOut(): Promise<void> {
    this.tokens = null;
    await this.storage.clear();
  }

  get isSignedIn(): boolean {
    return this.tokens !== null;
  }

  private async refreshNow(refreshToken: string): Promise<Tokens | null> {
    try {
      const fresh = await this.firebase.refresh(refreshToken);
      // The user may have signed out while the refresh was in flight; don't bring the session back.
      if (this.tokens?.refreshToken !== refreshToken) return null;
      await this.adopt(fresh);
      return fresh;
    } catch (err) {
      if (isDeadSession(err)) {
        await this.signOut();
        return null;
      }
      throw err;
    }
  }

  private async adopt(tokens: Tokens): Promise<void> {
    this.tokens = tokens;
    await this.storage.set(tokens.refreshToken);
  }
}
