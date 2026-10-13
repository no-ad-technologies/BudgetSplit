import { DEMO_GROUP, DEMO_USERS } from "@budgetsplit/shared";

/**
 * Where the API lives. On a real phone "localhost" is the phone itself, so set
 * EXPO_PUBLIC_API_URL to your laptop's LAN address (http://192.168.x.x:4000) or the Render URL.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** DEV ONLY: who we pretend to be until sign-in (US-01) exists. Defaults to Maya. */
export const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? DEMO_USERS.maya.id;

/** The group this screen shows until group creation (US-02) exists. */
export const GROUP_ID = process.env.EXPO_PUBLIC_GROUP_ID ?? DEMO_GROUP.id;

/** Requests that take longer than this fail with a friendly message instead of hanging. */
export const REQUEST_TIMEOUT_MS = 15_000;
