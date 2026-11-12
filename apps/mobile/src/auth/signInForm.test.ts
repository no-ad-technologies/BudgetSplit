import { describe, expect, it } from "vitest";
import { checkAuthForm, type AuthFormDraft } from "./signInForm";

const draft = (over: Partial<AuthFormDraft> = {}): AuthFormDraft => ({
  mode: "signUp",
  displayName: "Josh",
  email: "josh@hc.edu",
  password: "long enough",
  ...over,
});

describe("checkAuthForm (US-01)", () => {
  it("accepts a complete sign-up and trims what it sends", () => {
    expect(checkAuthForm(draft({ displayName: "  Josh ", email: " Josh@HC.edu " }))).toEqual({
      problem: null,
      displayName: "Josh",
      email: "josh@hc.edu",
    });
  });

  it("sign-up needs a name, a real email and an 8-character password", () => {
    expect(checkAuthForm(draft({ displayName: "  " })).problem).toMatch(/name/);
    expect(checkAuthForm(draft({ displayName: "x".repeat(61) })).problem).toMatch(/too long/);
    expect(checkAuthForm(draft({ email: "josh@" })).problem).toMatch(/email/);
    expect(checkAuthForm(draft({ password: "short" })).problem).toMatch(/at least 8/);
  });

  it("sign-in needs only an email and a password, of any length", () => {
    expect(checkAuthForm(draft({ mode: "signIn", displayName: "", password: "old" })).problem).toBeNull();
    expect(checkAuthForm(draft({ mode: "signIn", password: "" })).problem).toMatch(/password/);
  });
});
