import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Anthropic API key for the AI summary (US-11). A secret: set it in Render, never in the repo. Optional. */
  ANTHROPIC_API_KEY: z.string().trim().min(20).optional(),
  LLM_MODEL: z.string().trim().regex(/^[a-z0-9.-]{3,60}$/).default("claude-haiku-5-5"),
  /** Hard ceiling on paid model calls per UTC day, across all users. */
  LLM_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).max(100_000).default(500),
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
  /** Requests one signed-in user may make per minute before getting 429s. 0 turns the limit off. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).max(10_000).default(120),
  LOG_REQUESTS: z.enum(["true", "false"]).optional(),
});

export type AuthConfig = { mode: "dev" } | { mode: "firebase"; firebaseProjectId: string };

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  /** Null when no API key is set: the summary endpoint still returns the numbers. */
  llm: { apiKey: string; model: string; dailyCallLimit: number } | null;
  databaseUrl: string;
  authMode: "dev" | "firebase";
  auth: AuthConfig;
  /** Undefined when the limit is switched off. */
  userRateLimit?: { limit: number; windowMs: number };
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
    llm: parsed.ANTHROPIC_API_KEY
      ? { apiKey: parsed.ANTHROPIC_API_KEY, model: parsed.LLM_MODEL, dailyCallLimit: parsed.LLM_DAILY_CALL_LIMIT }
      : null,
    databaseUrl: parsed.DATABASE_URL,
    authMode: parsed.AUTH_MODE,
    auth,
    userRateLimit: parsed.RATE_LIMIT_PER_MINUTE > 0 ? { limit: parsed.RATE_LIMIT_PER_MINUTE, windowMs: 60_000 } : undefined,
    logRequests: parsed.LOG_REQUESTS ? parsed.LOG_REQUESTS === "true" : parsed.NODE_ENV !== "test",
  };
}
