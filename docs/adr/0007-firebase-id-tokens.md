# ADR 0007 · Stateless Firebase ID tokens, verified on every request

- **Status:** Accepted · 2026-11-12 (implements US-01, supersedes ADR 0004 in production)

## Context
ADR 0004 left one seam for real authentication: a middleware that fills `res.locals.user`. Until now that
middleware trusted an `X-User-Id` header, so anyone who knew a user's id could post expenses and confirm
payments as them. That is the first attack in our threat model ([docs/security/threat-model.md](../security/threat-model.md)).

We need sign-in that a three-person team can run without storing passwords or operating a session store.

## Decision
- **Firebase Authentication is the identity provider.** Passwords are typed into the app and sent to
  Firebase over HTTPS. Our API and database never see or store a password.
- **The API is stateless.** Each request carries `Authorization: Bearer <Firebase ID token>`. `tokenAuth`
  (`apps/api/src/http/auth.ts`) verifies it every time: RS256 signature against Google's published keys,
  `aud` = our project id, `iss` = `https://securetoken.google.com/<project id>`, not expired, non-empty
  `sub`. There is no server-side session and no cookie.
- **Verification uses `jose` and Google's public JWKS**, not the Firebase Admin SDK. It needs only the
  public project id (`FIREBASE_PROJECT_ID`), so the API holds no Firebase secret that could leak.
- **Accounts are created on first sign-in.** `users.auth_uid` stores the Firebase UID (unique index).
  The email is stored only when Firebase has verified it.
- **The app keeps the one-hour ID token in memory and the refresh token in the Keychain / Keystore**
  (`expo-secure-store`). Sign-out deletes both. The app uses Firebase's REST endpoints with `fetch`, so
  it runs in Expo Go without native setup.
- **Every rejection is the same 401.** The reason goes to our logs (`token_rejected`), never to the caller.
- `AUTH_MODE=dev` still exists for local development and the integration tests. `loadConfig` refuses to
  start production with it, and `render.yaml` no longer sets the override flag.

## Consequences
- A stolen ID token works until it expires (at most one hour). We accept that window instead of calling
  Firebase on every request; checking revocation would need the Admin SDK and a service-account secret.
- Sign-in today is email + password. Google sign-in and email links (the wording of US-01) are client-only
  additions: the API already accepts an ID token from any Firebase provider.
- The seeded demo users have no `auth_uid`, so they cannot be signed in to. They exist only in dev mode.
- The API fetches Google's signing keys on first use and when they rotate. If Google is unreachable at
  that moment, requests fail with 500 until it is back; cached keys keep working in between.
