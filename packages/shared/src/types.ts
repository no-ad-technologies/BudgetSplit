/**
 * API contract between the BudgetSplit mobile app and the API.
 * Both sides import these types, so a breaking change fails the typecheck in CI
 * instead of failing on someone's phone.
 */

/** Header the dev-only auth stub reads (local development and tests). Production uses a Bearer token (US-01). */
export const DEV_USER_HEADER = "X-User-Id";

/** GET /users/me (US-01): the account behind the caller's token. */
export interface MeDto {
  id: string;
  displayName: string;
}

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
  rateLimited: "rate_limited",
  notAMember: "not_a_member",
  invalidGroupId: "invalid_group_id",
  groupNotFound: "group_not_found",
  payerNotMember: "payer_not_member",
  shareNotMember: "share_not_member",
  payeeNotMember: "payee_not_member",
  cannotPaySelf: "cannot_pay_self",
  invalidSettlementId: "invalid_settlement_id",
  settlementNotFound: "settlement_not_found",
  notSettlementReceiver: "not_settlement_receiver",
  settlementNotPending: "settlement_not_pending",
  notGroupAdmin: "not_group_admin",
  groupFull: "group_full",
  invalidInviteId: "invalid_invite_id",
  inviteNotFound: "invite_not_found",
  inviteExpired: "invite_expired",
  inviteRevoked: "invite_revoked",
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

/** POST /groups (US-02). The signed-in member becomes the group's first member and admin. */
export interface CreateGroupRequest {
  name: string;
}

/** Links look like budgetsplit://join/<token>; the app scheme is set in apps/mobile/app.json. */
export const INVITE_LINK_PREFIX = "budgetsplit://join/";

/** How long an invite link works (US-02). */
export const INVITE_TTL_DAYS = 7;

/** An active invite as the admin sees it. The token itself is only returned once, when it is created. */
export interface InviteDto {
  id: string;
  groupId: string;
  createdById: string;
  createdAt: string;
  expiresAt: string;
}

/** POST /groups/:groupId/invites: the only time the token is visible. Share `url` (or `token`) with roommates. */
export interface CreatedInviteDto extends InviteDto {
  token: string;
  url: string;
}

export interface InviteListDto {
  invites: InviteDto[];
}

/** POST /invites/:token/accept. `joined` is false when the user was already a member. */
export interface AcceptInviteResponse {
  group: GroupDto;
  joined: boolean;
}

export interface MemberBalanceDto {
  userId: string;
  displayName: string;
  /** Total this member paid for the group, in cents. */
  paidCents: number;
  /** Total of this member's shares, in cents. */
  shareCents: number;
  /** Confirmed settlements this member paid to others (US-07). Pending and rejected ones don't count. */
  sentCents: number;
  /** Confirmed settlements this member received from others (US-07). */
  receivedCents: number;
  /** paidCents − shareCents + sentCents − receivedCents. Positive = is owed money, negative = owes money. */
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

export type SettlementStatus = "PENDING" | "CONFIRMED" | "REJECTED";

/** A payment between two members (US-07), with its full audit trail. */
export interface SettlementDto {
  id: string;
  groupId: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amountCents: number;
  status: SettlementStatus;
  recordedById: string;
  createdAt: string;
  /** Who confirmed or rejected it (always the receiver) and when; null while pending. */
  respondedById: string | null;
  respondedAt: string | null;
  rejectReason: string | null;
}

/** POST /groups/:groupId/settlements. The signed-in member is the payer. */
export interface RecordSettlementRequest {
  toUserId: string;
  amountCents: number;
}

/** POST /groups/:groupId/settlements/:settlementId/reject. */
export interface RejectSettlementRequest {
  reason: string;
}

export interface SettlementListDto {
  settlements: SettlementDto[];
}

/** Every settlement write returns the settlement and the group's balances after it. */
export interface SettlementResponse {
  settlement: SettlementDto;
  balances: BalancesDto;
  /** True when the Idempotency-Key matched an earlier request and nothing new was saved. */
  replayed?: boolean;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** How far back a fairness summary can look (US-11). */
export const SUMMARY_WINDOW_DAYS = [30, 90] as const;
export type SummaryWindowDays = (typeof SUMMARY_WINDOW_DAYS)[number];

/** One member's contribution over the summary window (US-11). Computed by the server, never by the model. */
export interface MemberContributionDto {
  userId: string;
  displayName: string;
  /** What the model calls this member ("Member A"). It never sees the name (ADR 0005). */
  alias: string;
  /** Total this member paid for the group's expenses in the window, in cents. */
  paidCents: number;
  /** Total of this member's own shares of those expenses, in cents. */
  shareCents: number;
  /** paidCents − shareCents. Positive = paid more than their own share. */
  differenceCents: number;
  /** paidCents as a whole percentage of everything the group spent in the window. */
  paidPercent: number;
}

/**
 * - `ok`: `summary` is the model's text, checked against the numbers below.
 * - `no_expenses`: nothing to summarize in the window; the model was not called.
 * - `limited`: this member or group has asked for too many summaries recently.
 * - `unavailable`: the model was off, slow, failed, or its answer did not pass the checks.
 * The numbers are always present, whatever the status.
 */
export type FairnessSummaryStatus = "ok" | "no_expenses" | "limited" | "unavailable";

/** GET /groups/:groupId/summary?days=30 (US-11). */
export interface FairnessSummaryDto {
  groupId: string;
  days: SummaryWindowDays;
  expenseCount: number;
  totalCents: number;
  members: MemberContributionDto[];
  status: FairnessSummaryStatus;
  /** Uses aliases ("Member A"); the app swaps in names with `withMemberNames`. Null unless status is `ok`. */
  summary: string | null;
}
