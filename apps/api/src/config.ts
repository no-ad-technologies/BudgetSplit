import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /**
   * "firebase" verifies a Firebase ID token on every request (US-01, ADR 0007).
   * "dev" trusts an X-User-Id header and is for local development and tests only (ADR 0004).
   */
  AUTH_MODE: z.enum(["dev", "firebase"]).default("dev"),
  /** The Firebase project whose ID tokens we accept. Required when AUTH_MODE=firebase. Not a secret. */
  FIREBASE_PROJECT_ID: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{4,40}$/, "FIREBASE_PROJECT_ID looks wrong (lowercase letters, digits and dashes)")
    .optional(),
  /** Dev auth is refused in production unless this is explicitly "true". Nothing we deploy sets it any more. */
  ALLOW_DEV_AUTH_IN_PRODUCTION: z.enum(["true", "false"]).default("false"),
  LOG_REQUESTS: z.enum(["true", "false"]).optional(),
});

export type AuthConfig = { mode: "dev" } | { mode: "firebase"; firebaseProjectId: string };

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  authMode: "dev" | "firebase";
  auth: AuthConfig;
  logRequests: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);

  if (parsed.NODE_ENV === "production" && parsed.AUTH_MODE === "dev" && parsed.ALLOW_DEV_AUTH_IN_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to start: AUTH_MODE=dev in production. Set AUTH_MODE=firebase and FIREBASE_PROJECT_ID (docs/auth-setup.md).",
    );
  }

  let auth: AuthConfig = { mode: "dev" };
  if (parsed.AUTH_MODE === "firebase") {
    if (!parsed.FIREBASE_PROJECT_ID) {
      throw new Error("Refusing to start: AUTH_MODE=firebase needs FIREBASE_PROJECT_ID (docs/auth-setup.md).");
    }
    auth = { mode: "firebase", firebaseProjectId: parsed.FIREBASE_PROJECT_ID };
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    authMode: parsed.AUTH_MODE,
    auth,
    logRequests: parsed.LOG_REQUESTS ? parsed.LOG_REQUESTS === "true" : parsed.NODE_ENV !== "test",
  };
}
