import { describe, expect, it } from "vitest";
import { formatExpiry, inviteShareMessage, parseInviteInput } from "./inviteText";

const token = "AbCdEfGhIjKlMnOpQrStUv_-";

describe("parseInviteInput (US-02)", () => {
  it("accepts the full link or just the code, with surrounding spaces", () => {
    expect(parseInviteInput(`budgetsplit://join/${token}`)).toBe(token);
    expect(parseInviteInput(`  ${token}\n`)).toBe(token);
  });

  it.each(["", "hello", `${token}x`, `https://example.com/join/${token}`, "budgetsplit://join/"])("rejects %j", (text) => {
    expect(parseInviteInput(text)).toBeNull();
  });
});

describe("inviteShareMessage (US-02)", () => {
  it("includes the link, the code and when it stops working", () => {
    const expiresAt = "2026-11-10T18:00:00.000Z";
    const message = inviteShareMessage("Maple St House", { url: `budgetsplit://join/${token}`, token, expiresAt });
    expect(message).toContain(`budgetsplit://join/${token}`);
    expect(message).toContain(`paste this code: ${token}`);
    expect(message).toContain(`works until ${formatExpiry(expiresAt)}`);
    expect(formatExpiry(expiresAt)).toMatch(/Nov 10/);
  });
});
