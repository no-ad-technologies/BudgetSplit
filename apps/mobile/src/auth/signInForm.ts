/** Validation for the sign-in / create-account form (US-01). Pure, so it is unit-tested. */

export type AuthFormMode = "signIn" | "signUp";

export interface AuthFormDraft {
  mode: AuthFormMode;
  displayName: string;
  email: string;
  password: string;
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_DISPLAY_NAME_LENGTH = 60;

export interface AuthFormCheck {
  /** First problem to show, or null when the form can be submitted. */
  problem: string | null;
  /** Trimmed values to send. */
  displayName: string;
  email: string;
}

export function checkAuthForm(draft: AuthFormDraft): AuthFormCheck {
  const displayName = draft.displayName.trim();
  const email = draft.email.trim().toLowerCase();
  let problem: string | null = null;

  if (draft.mode === "signUp" && displayName.length === 0) problem = "Enter the name your roommates will see.";
  else if (draft.mode === "signUp" && displayName.length > MAX_DISPLAY_NAME_LENGTH) problem = "That name is too long.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problem = "Enter your email address.";
  else if (draft.password.length === 0) problem = "Enter your password.";
  else if (draft.mode === "signUp" && draft.password.length < MIN_PASSWORD_LENGTH) {
    problem = `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }

  return { problem, displayName, email };
}
