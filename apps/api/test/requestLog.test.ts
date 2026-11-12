import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loggablePath, requestLog } from "../src/http/requestLog.ts";
import { logger } from "../src/logger.ts";

describe("requestLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never writes an invite token to the log", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const app = express();
    app.use(requestLog());
    const invites = express.Router();
    invites.post("/:token/accept", (_req, res) => void res.status(201).json({}));
    app.use("/invites", invites);

    const token = "s3cretInviteTokenABCDEF_";
    await request(app).post(`/invites/${token}/accept`);

    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(info.mock.calls)).not.toContain(token);
    expect(info.mock.calls[0]?.[0]).toMatchObject({ method: "POST", path: "/invites/[token]/accept", status: 201 });
  });

  it("keeps ordinary paths, without their query string", () => {
    expect(loggablePath("/groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/expenses?limit=20")).toBe(
      "/groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/expenses",
    );
    expect(loggablePath("/invites/abc")).toBe("/invites/[token]");
    expect(loggablePath("/health")).toBe("/health");
  });
});
