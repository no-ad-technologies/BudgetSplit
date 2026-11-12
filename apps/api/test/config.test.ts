import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("loadConfig", () => {
  it("uses safe defaults for local development", () => {
    const config = loadConfig({ ...base });
    expect(config).toMatchObject({ nodeEnv: "development", port: 4000, authMode: "dev", logRequests: true });
  });

  it("the AI summary is off without an API key and uses the small model by default", () => {
    expect(loadConfig({ ...base }).llm).toBeNull();
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: "sk-ant-test-0123456789abcdef" }).llm).toEqual({
      apiKey: "sk-ant-test-0123456789abcdef",
      model: "claude-haiku-5-5",
      dailyCallLimit: 500,
    });
  });

  it("refuses to start production with the dev auth stub unless explicitly allowed", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/Refusing to start/);
    expect(loadConfig({ ...base, NODE_ENV: "production", ALLOW_DEV_AUTH_IN_PRODUCTION: "true" }).nodeEnv).toBe(
      "production",
    );
  });

  it("firebase auth needs a project id, and then production starts without any override", () => {
    expect(() => loadConfig({ ...base, AUTH_MODE: "firebase" })).toThrow(/FIREBASE_PROJECT_ID/);
    expect(() => loadConfig({ ...base, AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: "Not A Project" })).toThrow();
    const config = loadConfig({ ...base, NODE_ENV: "production", AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: "budgetsplit-1a2b3" });
    expect(config.auth).toEqual({ mode: "firebase", firebaseProjectId: "budgetsplit-1a2b3" });
  });

  it("limits each user to 120 requests a minute by default; 0 switches it off", () => {
    expect(loadConfig({ ...base }).userRateLimit).toEqual({ limit: 120, windowMs: 60_000 });
    expect(loadConfig({ ...base, RATE_LIMIT_PER_MINUTE: "30" }).userRateLimit?.limit).toBe(30);
    expect(loadConfig({ ...base, RATE_LIMIT_PER_MINUTE: "0" }).userRateLimit).toBeUndefined();
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
