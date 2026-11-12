import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiErrorCode, DEV_USER_HEADER } from "@budgetsplit/shared";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { logger } from "../logger.ts";
import { HttpError } from "./errors.ts";
import { InvalidTokenError, type TokenVerifier, type VerifiedIdentity } from "./tokenVerifier.ts";

export interface AuthUser {
  id: string;
  displayName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user: AuthUser;
      groupId: string;
    }
  }
}

const UserId = z.uuid();

/**
 * DEV-ONLY authentication stub (ADR 0004), kept for local development and the integration tests.
 * Trusts the X-User-Id header if it names an existing user. Production uses tokenAuth below;
 * config.ts refuses to boot production with this stub.
 */
export function devAuth(db: Db): RequestHandler {
  return async (req, res, next) => {
    const parsed = UserId.safeParse(req.header(DEV_USER_HEADER));
    if (!parsed.success) {
      throw new HttpError(401, ApiErrorCode.unauthenticated, `Send a valid user id in the ${DEV_USER_HEADER} header.`);
    }
    const user = await db.user.findUnique({
      where: { id: parsed.data },
      select: { id: true, displayName: true },
    });
    if (!user) throw new HttpError(401, ApiErrorCode.unauthenticated, "Unknown user.");
    res.locals.user = user;
    next();
  };
}

const MAX_DISPLAY_NAME = 60;
/** A JWT is three base64url parts. Anything longer than this is not a token we issued a session for. */
const MAX_TOKEN_LENGTH = 4096;
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/** The name a brand-new account starts with: the provider's name, else the part of the email before "@". */
export function initialDisplayName(identity: VerifiedIdentity): string {
  const candidate = identity.name ?? identity.email?.split("@")[0] ?? "";
  // Strip control characters; names are shown to other members.
  const clean = candidate.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_DISPLAY_NAME);
  return clean || "New member";
}

/**
 * Finds the user behind a verified identity, creating the account the first time they sign in (US-01).
 * Two first requests can race; the unique index on auth_uid makes the loser fall back to a read.
 */
export async function findOrCreateUser(db: Db, identity: VerifiedIdentity): Promise<AuthUser> {
  const select = { id: true, displayName: true } as const;
  const byUid = () => db.user.findUnique({ where: { authUid: identity.uid }, select });

  const existing = await byUid();
  if (existing) return existing;

  const displayName = initialDisplayName(identity);
  try {
    return await db.user.create({ data: { authUid: identity.uid, displayName, email: identity.email }, select });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    // Unique violation: either the same sign-in raced us (auth_uid) or the email belongs to an older row.
    const raced = await byUid();
    if (raced) return raced;
    return await db.user.create({ data: { authUid: identity.uid, displayName }, select });
  }
}

/**
 * Real authentication (US-01, ADR 0007): every request carries `Authorization: Bearer <ID token>`.
 * The token is verified on every request; the server keeps no session of its own, so there is no
 * session id to steal or fix. Any failure is the same 401, so a caller can't tell why a token was refused.
 */
export function tokenAuth(db: Db, verifier: TokenVerifier): RequestHandler {
  return async (req, res, next) => {
    const header = req.header("Authorization") ?? "";
    const token = header.length <= MAX_TOKEN_LENGTH ? BEARER.exec(header)?.[1] : undefined;
    if (!token) {
      throw new HttpError(401, ApiErrorCode.unauthenticated, "Sign in to continue.");
    }

    let identity: VerifiedIdentity;
    try {
      identity = await verifier.verify(token);
    } catch (err) {
      if (!(err instanceof InvalidTokenError)) throw err;
      logger.warn({ reason: err.message }, "token_rejected");
      throw new HttpError(401, ApiErrorCode.unauthenticated, "Your session has expired. Sign in again.");
    }

    res.locals.user = await findOrCreateUser(db, identity);
    next();
  };
}

const GroupId = z.uuid();

/** Authorization: every /groups/:groupId route is visible only to members of that group (multi-tenant isolation). */
export function requireGroupMember(db: Db): RequestHandler {
  return async (req, res, next) => {
    const parsed = GroupId.safeParse(req.params.groupId);
    if (!parsed.success) throw new HttpError(400, ApiErrorCode.invalidGroupId, "Group id must be a UUID.");

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: parsed.data, userId: res.locals.user.id } },
      select: { groupId: true },
    });
    if (!membership) throw new HttpError(403, ApiErrorCode.notAMember, "You are not a member of this group.");

    res.locals.groupId = parsed.data;
    next();
  };
}
