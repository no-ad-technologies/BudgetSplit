import { DEMO_GROUP, DEMO_MEMBER_ORDER, DEMO_USERS } from "@budgetsplit/shared";
import type { Db } from "../db.ts";
import { createEvenExpense } from "../modules/expenses/expenses.service.ts";

/**
 * Creates the demo group "Maple St House" (Maya, Josh, Priya, Sam) plus Riley, who is not a member.
 * Safe to run repeatedly: users and memberships are upserted, and the sample expenses use fixed
 * idempotency keys, so a second run adds nothing.
 */
export async function seedDemo(db: Db): Promise<void> {
  for (const user of Object.values(DEMO_USERS)) {
    await db.user.upsert({
      where: { id: user.id },
      create: { id: user.id, displayName: user.displayName },
      update: { displayName: user.displayName },
    });
  }

  await db.group.upsert({
    where: { id: DEMO_GROUP.id },
    create: { id: DEMO_GROUP.id, name: DEMO_GROUP.name },
    update: { name: DEMO_GROUP.name },
  });

  // Stagger joinedAt so join order (and therefore who gets leftover cents) is deterministic.
  const base = Date.UTC(2026, 8, 1); // Sept 1, 2026
  for (const [index, member] of DEMO_MEMBER_ORDER.entries()) {
    await db.groupMember.upsert({
      where: { groupId_userId: { groupId: DEMO_GROUP.id, userId: member.id } },
      create: {
        groupId: DEMO_GROUP.id,
        userId: member.id,
        role: index === 0 ? "ADMIN" : "MEMBER",
        joinedAt: new Date(base + index * 60_000),
      },
      update: {},
    });
  }

  const sampleExpenses = [
    { key: "seed-wifi-october", description: "WiFi (October)", amountCents: 6000, paidBy: DEMO_USERS.maya.id },
    { key: "seed-groceries-0001", description: "Groceries", amountCents: 4510, paidBy: DEMO_USERS.josh.id },
  ];
  for (const e of sampleExpenses) {
    await createEvenExpense(db, {
      groupId: DEMO_GROUP.id,
      actorId: e.paidBy,
      input: { description: e.description, amountCents: e.amountCents, paidById: e.paidBy },
      idempotencyKey: e.key,
    });
  }
}

/**
 * Empties every table. Refuses to run unless the database name contains "test",
 * so the integration tests can never wipe a dev or production database by mistake.
 */
export async function resetTestDatabase(db: Db, databaseUrl: string): Promise<void> {
  const name = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!name.includes("test")) {
    throw new Error(`Refusing to reset database "${name}": its name must contain "test".`);
  }
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "expense_shares", "expenses", "group_members", "groups", "users" RESTART IDENTITY CASCADE',
  );
}
