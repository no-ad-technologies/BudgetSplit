import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /**
   * "dev" trusts an X-User-Id header and exists only until US-01 adds Firebase Auth.
   * Adding "firebase" here is the only change the rest of the app needs.
   */
  AUTH_MODE: z.enum(["dev"]).default("dev"),
  /** Dev auth is refused in production unless this is explicitly "true" (M2 demo deployment only). */
  ALLOW_DEV_AUTH_IN_PRODUCTION: z.enum(["true", "false"]).default("false"),
  LOG_REQUESTS: z.enum(["true", "false"]).optional(),
});

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  authMode: "dev";
  logRequests: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);

  if (parsed.NODE_ENV === "production" && parsed.AUTH_MODE === "dev" && parsed.ALLOW_DEV_AUTH_IN_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to start: AUTH_MODE=dev in production. Set ALLOW_DEV_AUTH_IN_PRODUCTION=true only for the seeded M2 demo.",
    );
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    authMode: parsed.AUTH_MODE,
    logRequests: parsed.LOG_REQUESTS ? parsed.LOG_REQUESTS === "true" : parsed.NODE_ENV !== "test",
  };
}
