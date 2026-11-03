import { ApiErrorCode, type SettleUpDto, type SettlementDto, type SettlementStatus } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { HttpError } from "../../http/errors.ts";
import { getGroupBalances } from "../balances/balances.service.ts";
import { planSettlement } from "./plan.ts";
import type { RecordSettlementInput } from "./settlements.schema.ts";

/**
 * The group's settle-up plan (US-06), computed fresh from the current balances on every request, so it
 * always reflects the latest expenses and confirmed settlements. Balances come in join order, which breaks ties.
 */
export async function getSettleUpPlan(db: Db, groupId: string): Promise<SettleUpDto> {
  const { balances } = await getGroupBalances(db, groupId);
  const names = new Map(balances.map((b) => [b.userId, b.displayName]));
  const plan = planSettlement(balances);
  return {
    groupId,
    exact: plan.exact,
    payments: plan.payments.map((p) => ({
      fromUserId: p.fromUserId,
      fromName: names.get(p.fromUserId)!,
      toUserId: p.toUserId,
      toName: names.get(p.toUserId)!,
      amountCents: p.amountCents,
    })),
  };
}

const withNames = {
  payer: { select: { user: { select: { displayName: true } } } },
  payee: { select: { user: { select: { displayName: true } } } },
} as const;
type SettlementWithNames = Prisma.SettlementGetPayload<{ include: typeof withNames }>;
type Tx = Prisma.TransactionClient;

function toSettlementDto(s: SettlementWithNames): SettlementDto {
  return {
    id: s.id,
    groupId: s.groupId,
    fromUserId: s.fromUserId,
    fromName: s.payer.user.displayName,
    toUserId: s.toUserId,
    toName: s.payee.user.displayName,
    amountCents: s.amountCents,
    status: s.status,
    recordedById: s.recordedById,
    createdAt: s.createdAt.toISOString(),
    respondedById: s.respondedById,
    respondedAt: s.respondedAt?.toISOString() ?? null,
    rejectReason: s.rejectReason,
  };
}

async function findReplay(db: Tx, groupId: string, idempotencyKey: string): Promise<SettlementDto | null> {
  const existing = await db.settlement.findUnique({
    where: { groupId_idempotencyKey: { groupId, idempotencyKey } },
    include: withNames,
  });
  return existing ? toSettlementDto(existing) : null;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export interface RecordSettlementCommand {
  groupId: string;
  /** The signed-in member: always the payer. */
  actorId: string;
  input: RecordSettlementInput;
  idempotencyKey?: string;
}

/**
 * Records "I paid X $Y" as PENDING (US-07). Balances don't change until X confirms it.
 * Retries with the same Idempotency-Key return the original settlement instead of a second one.
 */
export async function recordSettlement(
  db: Db,
  cmd: RecordSettlementCommand,
): Promise<{ settlement: SettlementDto; replayed: boolean }> {
  const { groupId, actorId, input, idempotencyKey } = cmd;
  if (input.toUserId === actorId) {
    throw new HttpError(422, ApiErrorCode.cannotPaySelf, "You can't record a payment to yourself.");
  }

  try {
    return await db.$transaction(async (tx) => {
      if (idempotencyKey) {
        const replayed = await findReplay(tx, groupId, idempotencyKey);
        if (replayed) return { settlement: replayed, replayed: true };
      }
      const payee = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: input.toUserId } },
        select: { userId: true },
      });
      if (!payee) {
        throw new HttpError(422, ApiErrorCode.payeeNotMember, "The person you paid must be a member of this group.");
      }
      const created = await tx.settlement.create({
        data: {
          groupId,
          fromUserId: actorId,
          toUserId: input.toUserId,
          recordedById: actorId,
          amountCents: input.amountCents,
          idempotencyKey: idempotencyKey ?? null,
        },
        include: withNames,
      });
      return { settlement: toSettlementDto(created), replayed: false };
    });
  } catch (err) {
    if (idempotencyKey && isUniqueViolation(err)) {
      const replayed = await findReplay(db, groupId, idempotencyKey);
      if (replayed) return { settlement: replayed, replayed: true };
    }
    throw err;
  }
}

export async function listSettlements(
  db: Db,
  groupId: string,
  options: { status?: SettlementStatus; limit: number },
): Promise<SettlementDto[]> {
  const rows = await db.settlement.findMany({
    where: { groupId, ...(options.status ? { status: options.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit,
    include: withNames,
  });
  return rows.map(toSettlementDto);
}

export interface RespondCommand {
  groupId: string;
  settlementId: string;
  actorId: string;
  decision: "CONFIRMED" | "REJECTED";
  reason?: string;
}

/**
 * The receiver confirms or rejects a pending settlement (US-07). A single conditional UPDATE does the
 * check and the change together (only the receiver, only while PENDING), so two taps or two phones
 * racing can't confirm it twice: exactly one wins and the other gets 409.
 */
export async function respondToSettlement(db: Db, cmd: RespondCommand): Promise<SettlementDto> {
  const { groupId, settlementId, actorId, decision, reason } = cmd;
  const { count } = await db.settlement.updateMany({
    where: { id: settlementId, groupId, toUserId: actorId, status: "PENDING" },
    data: {
      status: decision,
      respondedById: actorId,
      respondedAt: new Date(),
      rejectReason: decision === "REJECTED" ? reason! : null,
    },
  });

  const settlement = await db.settlement.findFirst({ where: { id: settlementId, groupId }, include: withNames });
  if (!settlement) throw new HttpError(404, ApiErrorCode.settlementNotFound, "Payment not found in this group.");
  if (count === 1) return toSettlementDto(settlement);

  if (settlement.toUserId !== actorId) {
    throw new HttpError(
      403,
      ApiErrorCode.notSettlementReceiver,
      `Only ${settlement.payee.user.displayName} can confirm or reject this payment.`,
    );
  }
  throw new HttpError(
    409,
    ApiErrorCode.settlementNotPending,
    `This payment was already ${settlement.status.toLowerCase()}.`,
  );
}
