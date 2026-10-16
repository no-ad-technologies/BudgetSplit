import { ApiErrorCode, type ExpenseDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { HttpError } from "../../http/errors.ts";
import type { CreateExpenseInput } from "./expenses.schema.ts";
import { splitEven, type Share } from "./split.ts";

const withShares = { shares: { orderBy: { userId: "asc" } } } as const;
type ExpenseWithShares = Prisma.ExpenseGetPayload<{ include: typeof withShares }>;
/** The interactive transaction client, so helpers can share the transaction. */
type Tx = Prisma.TransactionClient;

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

/** Returns the already-stored expense for a retried Idempotency-Key, or null on first use. */
async function findReplay(db: Tx, groupId: string, idempotencyKey: string): Promise<ExpenseDto | null> {
  const existing = await db.expense.findUnique({
    where: { groupId_idempotencyKey: { groupId, idempotencyKey } },
    include: withShares,
  });
  return existing ? toExpenseDto(existing) : null;
}

/** Loads member ids in join order and checks the payer belongs to the group. */
async function resolveShares(tx: Tx, groupId: string, input: CreateExpenseInput): Promise<Share[]> {
  const members = await tx.groupMember.findMany({
    where: { groupId },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    select: { userId: true },
  });
  if (!members.some((m) => m.userId === input.paidById)) {
    throw new HttpError(422, ApiErrorCode.payerNotMember, "The payer must be a member of this group.");
  }
  return splitEven(
    input.amountCents,
    members.map((m) => m.userId),
  );
}

/**
 * Records an evenly split expense (US-03) in one transaction: the expense row and every share
 * row commit together or not at all.
 *
 * Business rules live in the helpers above; the transaction body only performs the reads it needs
 * and the writes. Retries are safe: if the same Idempotency-Key was already used in this group, the
 * original expense is returned with replayed=true and nothing new is written. Two requests racing
 * with the same key are caught by the unique index on (group_id, idempotency_key).
 */
export async function createEvenExpense(db: Db, cmd: CreateExpenseCommand): Promise<CreateExpenseResult> {
  const { groupId, actorId, input, idempotencyKey } = cmd;

  try {
    return await db.$transaction(async (tx) => {
      if (idempotencyKey) {
        const replayed = await findReplay(tx, groupId, idempotencyKey);
        if (replayed) return { expense: replayed, replayed: true };
      }

      const shares = await resolveShares(tx, groupId, input);

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
    // A racing request with the same key lost the unique-index race; return the winner's expense.
    if (idempotencyKey && isUniqueViolation(err)) {
      const replayed = await findReplay(db, groupId, idempotencyKey);
      if (replayed) return { expense: replayed, replayed: true };
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
