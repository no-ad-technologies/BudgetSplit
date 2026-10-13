/**
 * Fixed ids for the seeded demo group. The API seed script creates exactly these rows, and the
 * mobile app uses them as its development defaults until sign-in (US-01) and groups (US-02) exist.
 * Members are listed in join order, which decides who gets leftover cents in an even split.
 */
export const DEMO_GROUP = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Maple St House",
} as const;

export const DEMO_USERS = {
  maya: { id: "11111111-1111-4111-8111-111111111111", displayName: "Maya" },
  josh: { id: "22222222-2222-4222-8222-222222222222", displayName: "Josh" },
  priya: { id: "33333333-3333-4333-8333-333333333333", displayName: "Priya" },
  sam: { id: "44444444-4444-4444-8444-444444444444", displayName: "Sam" },
  /** Exists but is NOT in the demo group; used to show the 403 path. */
  riley: { id: "55555555-5555-4555-8555-555555555555", displayName: "Riley" },
} as const;

/** Join order of the demo group. */
export const DEMO_MEMBER_ORDER = [DEMO_USERS.maya, DEMO_USERS.josh, DEMO_USERS.priya, DEMO_USERS.sam] as const;
