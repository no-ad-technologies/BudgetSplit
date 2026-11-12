import {
  type AcceptInviteResponse,
  ApiErrorCode,
  DEV_USER_HEADER,
  IDEMPOTENCY_HEADER,
  type ApiErrorBody,
  type BalancesDto,
  type CreatedInviteDto,
  type CreateExpenseRequest,
  type CreateExpenseResponse,
  type GroupDto,
  type MeDto,
  type RecordSettlementRequest,
  type SettleUpDto,
  type SettlementListDto,
  type SettlementResponse,
  type UserGroupsDto,
} from "@budgetsplit/shared";
import { API_URL, DEV_USER_ID, REQUEST_TIMEOUT_MS } from "../config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * How requests prove who is calling. The default is the dev stub; AuthProvider swaps in the signed-in
 * session's Bearer token (US-01). Kept as a setter so this file stays free of React and Expo imports.
 */
export type AuthHeaders = () => Promise<Record<string, string>>;
let authHeaders: AuthHeaders = async () => ({ [DEV_USER_HEADER]: DEV_USER_ID });
let onUnauthorized: () => void = () => {};

export function configureApiAuth(options: { headers: AuthHeaders; onUnauthorized: () => void }): void {
  authHeaders = options.headers;
  onUnauthorized = options.onUnauthorized;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let identity: Record<string, string>;
  try {
    identity = await authHeaders();
  } catch {
    // Refreshing the session needs the network too.
    throw new ApiError(0, ApiErrorCode.networkError, "Can't reach BudgetSplit. Check your connection and try again.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...identity,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError(0, ApiErrorCode.networkError, "Can't reach BudgetSplit. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  // An empty body (204 No Content, e.g. revoking an invite) resolves to null.
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // The API no longer accepts our token (expired, revoked): back to the sign-in screen.
    if (res.status === 401) onUnauthorized();
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? ApiErrorCode.httpError,
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return body as T;
}

/**
 * A new key per expense draft. The screen keeps the same key while the user retries a failed save,
 * so a request that reached the server but lost its response can't create a duplicate (T1).
 */
export function newIdempotencyKey(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const api = {
  getMe: () => call<MeDto>("/users/me"),
  getGroup: (groupId: string) => call<GroupDto>(`/groups/${groupId}`),
  getBalances: (groupId: string) => call<BalancesDto>(`/groups/${groupId}/balances`),
  getMyGroups: () => call<UserGroupsDto>("/users/me/groups"),
  createGroup: (name: string) => call<GroupDto>("/groups", { method: "POST", body: JSON.stringify({ name }) }),
  createInvite: (groupId: string) => call<CreatedInviteDto>(`/groups/${groupId}/invites`, { method: "POST" }),
  revokeInvite: (groupId: string, inviteId: string) =>
    call<null>(`/groups/${groupId}/invites/${inviteId}`, { method: "DELETE" }),
  acceptInvite: (token: string) => call<AcceptInviteResponse>(`/invites/${token}/accept`, { method: "POST" }),
  getSettleUp: (groupId: string) => call<SettleUpDto>(`/groups/${groupId}/settle-up`),
  getPendingSettlements: (groupId: string) =>
    call<SettlementListDto>(`/groups/${groupId}/settlements?status=PENDING`),
  recordSettlement: (groupId: string, body: RecordSettlementRequest, idempotencyKey: string) =>
    call<SettlementResponse>(`/groups/${groupId}/settlements`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    }),
  confirmSettlement: (groupId: string, settlementId: string) =>
    call<SettlementResponse>(`/groups/${groupId}/settlements/${settlementId}/confirm`, { method: "POST" }),
  rejectSettlement: (groupId: string, settlementId: string, reason: string) =>
    call<SettlementResponse>(`/groups/${groupId}/settlements/${settlementId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  addExpense: (groupId: string, body: CreateExpenseRequest, idempotencyKey: string) =>
    call<CreateExpenseResponse>(`/groups/${groupId}/expenses`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    }),
};
