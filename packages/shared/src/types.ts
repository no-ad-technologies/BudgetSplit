/**
 * API contract between the BudgetSplit mobile app and the API.
 * Both sides import these types, so a breaking change fails the typecheck in CI
 * instead of failing on someone's phone.
 */

/** Header the dev-only auth stub reads. Replaced by a Firebase ID token in US-01. */
export const DEV_USER_HEADER = "X-User-Id";

/** Header that makes POST /expenses safe to retry (US-03, trade-off T1). */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/**
 * Every error code the API can return in `{ error: { code } }`.
 * Both sides import this object, so the API never invents a code the client does not know
 * and the client never reacts to a code the API no longer sends (no magic strings on either side).
 */
export const ApiErrorCode = {
  notFound: "not_found",
  validationFailed: "validation_failed",
  invalidJson: "invalid_json",
  unauthenticated: "unauthenticated",
  notAMember: "not_a_member",
  invalidGroupId: "invalid_group_id",
  groupNotFound: "group_not_found",
  payerNotMember: "payer_not_member",
  internalError: "internal_error",
  networkError: "network_error",
  httpError: "http_error",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type MemberRole = "ADMIN" | "MEMBER";
export type SplitType = "EVEN" | "EXACT" | "PERCENT";

export interface MemberDto {
  userId: string;
  displayName: string;
  role: MemberRole;
}

export interface GroupDto {
  id: string;
  name: string;
  members: MemberDto[];
}

export interface MemberBalanceDto {
  userId: string;
  displayName: string;
  /** Total this member paid for the group, in cents. */
  paidCents: number;
  /** Total of this member's shares, in cents. */
  shareCents: number;
  /** paidCents - shareCents. Positive = is owed money, negative = owes money. */
  netCents: number;
}

export interface BalancesDto {
  groupId: string;
  balances: MemberBalanceDto[];
}

export interface GroupSummaryDto {
  groupId: string;
  groupName: string;
  netCents: number;
}

export interface UserGroupsDto {
  groups: GroupSummaryDto[];
}

export interface ExpenseShareDto {
  userId: string;
  shareCents: number;
}

export interface ExpenseDto {
  id: string;
  groupId: string;
  description: string;
  amountCents: number;
  paidById: string;
  createdById: string;
  splitType: SplitType;
  createdAt: string;
  shares: ExpenseShareDto[];
}

export interface ExpenseListDto {
  expenses: ExpenseDto[];
}

export interface CreateExpenseRequest {
  description: string;
  amountCents: number;
  paidById: string;
}

export interface CreateExpenseResponse {
  expense: ExpenseDto;
  balances: BalancesDto;
  /** True when the Idempotency-Key matched an earlier request and nothing new was saved. */
  replayed: boolean;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}
