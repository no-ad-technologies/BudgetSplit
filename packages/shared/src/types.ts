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
  shareNotMember: "share_not_member",
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

/** One member's percentage in a PERCENT split, in basis points (1% = 100, 100% = 10,000). */
export interface PercentShareRequest {
  userId: string;
  basisPoints: number;
}

/** One member's custom amount in an EXACT split, in cents. */
export interface ExactShareRequest {
  userId: string;
  shareCents: number;
}

/**
 * How an expense is split (US-03, US-04). Members left out of `shares` get $0.00.
 * PERCENT shares must total 10,000 basis points; EXACT shares must total the expense amount.
 */
export type SplitRequest =
  | { type: "EVEN" }
  | { type: "PERCENT"; shares: PercentShareRequest[] }
  | { type: "EXACT"; shares: ExactShareRequest[] };

export interface CreateExpenseRequest {
  description: string;
  amountCents: number;
  paidById: string;
  /** Defaults to an even split across all members, so walking-skeleton clients keep working. */
  split?: SplitRequest;
}

export interface CreateExpenseResponse {
  expense: ExpenseDto;
  balances: BalancesDto;
  /** True when the Idempotency-Key matched an earlier request and nothing new was saved. */
  replayed: boolean;
}

/** One payment in a settle-up plan (US-06): who pays whom, and exactly how much. */
export interface SuggestedPaymentDto {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amountCents: number;
}

/** GET /groups/:groupId/settle-up. Making every payment brings every balance to $0.00. */
export interface SettleUpDto {
  groupId: string;
  /** True: the fewest possible payments (groups up to 12 with a balance). False: a suggested plan, at most n − 1. */
  exact: boolean;
  payments: SuggestedPaymentDto[];
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}
