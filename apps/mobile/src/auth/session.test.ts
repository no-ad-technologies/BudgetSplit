import { describe, expect, it, vi } from "vitest";
import {
  createFirebaseRest,
  FirebaseAuthError,
  FirebaseNetworkError,
  friendlyAuthMessage,
  type FirebaseRest,
  type Tokens,
} from "./firebaseRest";
import { REFRESH_MARGIN_MS, Session, type TokenStorage } from "./session";

const HOUR = 3_600_000;

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const storage: TokenStorage = {
    get: async () => value,
    set: async (v) => void (value = v),
    clear: async () => void (value = null),
  };
  return { storage, peek: () => value };
}

function fakeFirebase(now: () => number, overrides: Partial<FirebaseRest> = {}) {
  let n = 0;
  const mint = (): Tokens => ({ idToken: `id-${++n}`, refreshToken: `refresh-${n}`, expiresAt: now() + HOUR });
  const firebase: FirebaseRest = {
    signUp: vi.fn(async () => mint()),
    signIn: vi.fn(async () => mint()),
    setDisplayName: vi.fn(async () => undefined),
    refresh: vi.fn(async () => mint()),
    ...overrides,
  };
  return firebase;
}

describe("Session (US-01)", () => {
  it("signing in stores only the refresh token on the device", async () => {
    const { storage, peek } = memoryStorage();
    const session = new Session(fakeFirebase(() => 0), storage, () => 0);

    await session.signIn("josh@hc.edu", "correct horse");
    expect(await session.getIdToken()).toBe("id-1");
    expect(peek()).toBe("refresh-1");
    expect(peek()).not.toContain("id-1");
  });

  it("reuses the ID token until a minute before it expires, then refreshes it", async () => {
    let clock = 0;
    const firebase = fakeFirebase(() => clock);
    const session = new Session(firebase, memoryStorage().storage, () => clock);
    await session.signIn("josh@hc.edu", "pw");

    clock = HOUR - REFRESH_MARGIN_MS - 1;
    expect(await session.getIdToken()).toBe("id-1");
    expect(firebase.refresh).not.toHaveBeenCalled();

    clock = HOUR - REFRESH_MARGIN_MS;
    expect(await session.getIdToken()).toBe("id-2");
    expect(firebase.refresh).toHaveBeenCalledWith("refresh-1");
  });

  it("five requests at once share one refresh", async () => {
    let clock = 0;
    const firebase = fakeFirebase(() => clock);
    const session = new Session(firebase, memoryStorage().storage, () => clock);
    await session.signIn("josh@hc.edu", "pw");
    clock = 2 * HOUR;

    const tokens = await Promise.all(Array.from({ length: 5 }, () => session.getIdToken()));
    expect(new Set(tokens)).toEqual(new Set(["id-2"]));
    expect(firebase.refresh).toHaveBeenCalledTimes(1);
  });

  it("a second launch restores the session from the saved refresh token", async () => {
    const session = new Session(fakeFirebase(() => 0), memoryStorage("saved-refresh").storage, () => 0);
    expect(await session.restore()).toBe(true);
    expect(await session.getIdToken()).toBe("id-1");
  });

  it("a first launch has no session", async () => {
    const session = new Session(fakeFirebase(() => 0), memoryStorage().storage, () => 0);
    expect(await session.restore()).toBe(false);
    expect(await session.getIdToken()).toBeNull();
  });

  it("sign-out forgets the token on the device and in memory", async () => {
    const { storage, peek } = memoryStorage();
    const session = new Session(fakeFirebase(() => 0), storage, () => 0);
    await session.signIn("josh@hc.edu", "pw");

    await session.signOut();
    expect(peek()).toBeNull();
    expect(await session.getIdToken()).toBeNull();
    expect(session.isSignedIn).toBe(false);
  });

  it("a refresh token Firebase has revoked signs the device out", async () => {
    const { storage, peek } = memoryStorage("revoked");
    const firebase = fakeFirebase(() => 0, {
      refresh: async () => {
        throw new FirebaseAuthError("TOKEN_EXPIRED", "x");
      },
    });
    const session = new Session(firebase, storage, () => 0);
    await session.restore();

    expect(await session.getIdToken()).toBeNull();
    expect(peek()).toBeNull();
  });

  it("being offline does not sign the device out", async () => {
    const { storage, peek } = memoryStorage("saved-refresh");
    const firebase = fakeFirebase(() => 0, {
      refresh: async () => {
        throw new FirebaseNetworkError();
      },
    });
    const session = new Session(firebase, storage, () => 0);
    await session.restore();

    await expect(session.getIdToken()).rejects.toBeInstanceOf(FirebaseNetworkError);
    expect(peek()).toBe("saved-refresh");
    expect(session.isSignedIn).toBe(true);
  });

  it("signing out while a refresh is in flight does not bring the session back", async () => {
    let release: (t: Tokens) => void = () => {};
    const firebase = fakeFirebase(() => 0, { refresh: () => new Promise<Tokens>((resolve) => (release = resolve)) });
    const { storage, peek } = memoryStorage("saved-refresh");
    const session = new Session(firebase, storage, () => 0);
    await session.restore();

    const pending = session.getIdToken();
    await session.signOut();
    release({ idToken: "late", refreshToken: "late-refresh", expiresAt: HOUR });

    expect(await pending).toBeNull();
    expect(peek()).toBeNull();
  });

  it("sign-up sets the display name and then refreshes so the token carries it", async () => {
    const firebase = fakeFirebase(() => 0);
    const session = new Session(firebase, memoryStorage().storage, () => 0);

    await session.signUp("Josh", "josh@hc.edu", "long enough");
    expect(firebase.setDisplayName).toHaveBeenCalledWith("id-1", "Josh");
    expect(await session.getIdToken()).toBe("id-2");
  });
});

describe("createFirebaseRest", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fail = (message: string) => new Response(JSON.stringify({ error: { code: 400, message } }), { status: 400 });

  it("signs in with the documented endpoint and turns expiresIn into a timestamp", async () => {
    const fetchMock = vi.fn(async () => ok({ idToken: "i", refreshToken: "r", expiresIn: "3600" }));
    const firebase = createFirebaseRest({ apiKey: "KEY", fetch: fetchMock as unknown as typeof fetch, now: () => 1000 });

    expect(await firebase.signIn("a@b.co", "pw")).toEqual({ idToken: "i", refreshToken: "r", expiresAt: 1000 + HOUR });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.co", password: "pw", returnSecureToken: true });
  });

  it("refreshes through the secure token endpoint (snake_case response)", async () => {
    const fetchMock = vi.fn(async () => ok({ id_token: "i2", refresh_token: "r2", expires_in: "3600" }));
    const firebase = createFirebaseRest({ apiKey: "KEY", fetch: fetchMock as unknown as typeof fetch, now: () => 0 });

    expect(await firebase.refresh("r1")).toEqual({ idToken: "i2", refreshToken: "r2", expiresAt: HOUR });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://securetoken.googleapis.com/v1/token?key=KEY");
  });

  it("maps Firebase error codes, including ones with trailing detail", async () => {
    const firebase = createFirebaseRest({
      apiKey: "KEY",
      fetch: (async () => fail("WEAK_PASSWORD : Password should be at least 6 characters")) as unknown as typeof fetch,
    });
    await expect(firebase.signUp("a@b.co", "pw")).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
  });

  it("a network failure is a FirebaseNetworkError, not a sign-in failure", async () => {
    const firebase = createFirebaseRest({
      apiKey: "KEY",
      fetch: (async () => {
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });
    await expect(firebase.signIn("a@b.co", "pw")).rejects.toBeInstanceOf(FirebaseNetworkError);
  });

  it("a wrong email and a wrong password read the same", () => {
    expect(friendlyAuthMessage("EMAIL_NOT_FOUND")).toBe(friendlyAuthMessage("INVALID_PASSWORD"));
    expect(friendlyAuthMessage("INVALID_LOGIN_CREDENTIALS")).toBe("Email or password is incorrect.");
  });
});
