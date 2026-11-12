import { DEMO_GROUP, DEMO_USERS } from "@budgetsplit/shared";

/**
 * Where the API lives. On a real phone "localhost" is the phone itself, so set
 * EXPO_PUBLIC_API_URL to your laptop's LAN address (http://192.168.x.x:4000) or the Render URL.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/**
 * The Firebase project's Web API key (US-01, docs/auth-setup.md). It identifies the project and is meant
 * to ship inside the app; it is not a secret. What protects accounts is the password and the signed token.
 */
export const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || null;

/**
 * "firebase": real sign-in. "dev": no sign-in screen, the app sends X-User-Id to an API running with
 * AUTH_MODE=dev (local development against the seeded database). Dev is only chosen when no Firebase
 * key is configured, and the production API refuses dev requests either way.
 */
export const AUTH_MODE: "firebase" | "dev" = FIREBASE_API_KEY ? "firebase" : "dev";

/** DEV MODE ONLY: who the app pretends to be. Defaults to Maya. */
export const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? DEMO_USERS.maya.id;

/** Fallback group for the group screen when none is passed in. */
export const GROUP_ID = process.env.EXPO_PUBLIC_GROUP_ID ?? DEMO_GROUP.id;

/** Requests that take longer than this fail with a friendly message instead of hanging. */
export const REQUEST_TIMEOUT_MS = 15_000;
