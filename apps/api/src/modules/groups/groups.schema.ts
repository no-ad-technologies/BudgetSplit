import { z } from "zod";

/** Body of POST /groups (US-02). Same limit as the database column. */
export const CreateGroupBody = z.strictObject({
  name: z.string().trim().min(1, "Give the group a name").max(60, "Keep the name under 61 characters"),
});

/** Invite tokens are 24 URL-safe characters (18 random bytes, base64url). */
export const InviteToken = z.string().regex(/^[A-Za-z0-9_-]{24}$/, "That invite code doesn't look right");

export const InviteId = z.uuid();
