import {
  DEV_USER_HEADER,
  IDEMPOTENCY_HEADER,
  type ApiErrorBody,
  type BalancesDto,
  type CreateExpenseRequest,
  type CreateExpenseResponse,
  type GroupDto,
  type UserGroupsDto,
} from "@budgetsplit/shared";
import { API_URL, DEV_USER_ID, REQUEST_TIMEOUT_MS } from "../config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
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
        [DEV_USER_HEADER]: DEV_USER_ID,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach BudgetSplit. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (${res.status})`, err?.details);
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
  getGroup: (groupId: string) => call<GroupDto>(`/groups/${groupId}`),
  getBalances: (groupId: string) => call<BalancesDto>(`/groups/${groupId}/balances`),
  getMyGroups: () => call<UserGroupsDto>("/users/me/groups"),
  addExpense: (groupId: string, body: CreateExpenseRequest, idempotencyKey: string) =>
    call<CreateExpenseResponse>(`/groups/${groupId}/expenses`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    }),
};
