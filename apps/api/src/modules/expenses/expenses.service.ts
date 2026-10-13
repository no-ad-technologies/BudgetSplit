import type { ExpenseDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { HttpError } from "../../http/errors.ts";
import type { CreateExpenseInput } from "./expenses.schema.ts";
import { splitEven } from "./split.ts";

const withShares = { shares: { orderBy: { userId: "asc" } } } as const;
type ExpenseWithShares = Prisma.ExpenseGetPayload<{ include: typeof withShares }>;

export function toExpenseDto(expense: ExpenseWithShares): ExpenseDto {
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    amountCents: expense.amountCents,
    paidById: expense.paidById,
    createdById: expense.createdById,
    splitType: expense.splitType,
    createdAt: expense.createdAt.toISOString(),
    shares: expense.shares.map((s) => ({ userId: s.userId, shareCents: s.shareCents })),
  };
}

export interface CreateExpenseCommand {
  groupId: string;
  actorId: string;
  input: CreateExpenseInput;
  idempotencyKey?: string;
}

export interface CreateExpenseResult {
  expense: ExpenseDto;
  replayed: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function findByIdempotencyKey(db: Db, groupId: string, idempotencyKey: string) {
  return db.expense.findUnique({
    where: { groupId_idempotencyKey: { groupId, idempotencyKey } },
    include: withShares,
  });
}

/**
 * Records an evenly split expense (US-03) in one transaction: the expense row and every share
 * row commit together or not at all.
 *
 * Retries are safe: if the same Idempotency-Key was already used in this group, the original
 * expense is returned with replayed=true and nothing new is written. Two requests racing with the
 * same key are caught by the unique index on (group_id, idempotency_key).
 */
export async function createEvenExpense(db: Db, cmd: CreateExpenseCommand): Promise<CreateExpenseResult> {
  const { groupId, actorId, input, idempotencyKey } = cmd;

  try {
    return await db.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.expense.findUnique({
          where: { groupId_idempotencyKey: { groupId, idempotencyKey } },
          include: withShares,
        });
        if (existing) return { expense: toExpenseDto(existing), replayed: true };
      }

      const members = await tx.groupMember.findMany({
        where: { groupId },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        select: { userId: true },
      });
      if (!members.some((m) => m.userId === input.paidById)) {
        throw new HttpError(422, "payer_not_member", "The payer must be a member of this group.");
      }

      const shares = splitEven(
        input.amountCents,
        members.map((m) => m.userId),
      );

      const created = await tx.expense.create({
        data: {
          groupId,
          paidById: input.paidById,
          createdById: actorId,
          description: input.description,
          amountCents: input.amountCents,
          splitType: "EVEN",
          idempotencyKey: idempotencyKey ?? null,
          shares: { create: shares },
        },
        include: withShares,
      });
      return { expense: toExpenseDto(created), replayed: false };
    });
  } catch (err) {
    if (idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(db, groupId, idempotencyKey);
      if (existing) return { expense: toExpenseDto(existing), replayed: true };
    }
    throw err;
  }
}

export async function listExpenses(db: Db, groupId: string, limit: number): Promise<ExpenseDto[]> {
  const rows = await db.expense.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: withShares,
  });
  return rows.map(toExpenseDto);
}
