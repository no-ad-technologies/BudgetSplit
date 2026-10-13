import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("loadConfig", () => {
  it("uses safe defaults for local development", () => {
    const config = loadConfig({ ...base });
    expect(config).toMatchObject({ nodeEnv: "development", port: 4000, authMode: "dev", logRequests: true });
  });

  it("refuses to start production with the dev auth stub unless explicitly allowed", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/Refusing to start/);
    expect(loadConfig({ ...base, NODE_ENV: "production", ALLOW_DEV_AUTH_IN_PRODUCTION: "true" }).nodeEnv).toBe(
      "production",
    );
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
