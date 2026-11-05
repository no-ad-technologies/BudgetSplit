# Refactoring log (Ch. 8)

Each entry names the code smell, shows the code before and after, and says how we know behavior didn't
change. Entries 1–2 were made in PR #12 (Oct 16). Entries 3–4 were made during Deliverable 3 on branch
`refactor/dedupe-balance-queries`, with tests written **before** the change so the refactor could be shown to
preserve behavior.

| # | Smell | Where | Commit |
| --- | --- | --- | --- |
| 1 | Long method (one function mixing replay lookup, membership rules, splitting and writes) | `apps/api/src/modules/expenses/expenses.service.ts` | `a088313` (PR #12) |
| 2 | Large class / component doing too much (fetching, state, form and list in one 240-line screen) | `apps/mobile/src/screens/GroupScreen.tsx` | `a088313` (PR #12) |
| 3 | Duplicated code + deep nesting (balance queries copied into a route handler, three callbacks deep) | `apps/api/src/modules/groups/userGroups.routes.ts` | `60c51d9` tests, `27a3578` refactor |
| 4 | Duplicated code (copied color palette and owe/owed color logic) | `apps/mobile/src/screens/HomeScreen.tsx` | `c4e5acb` |

---

## 1 · Long method → Extract Method (`createEvenExpense`)

**Smell.** One function did four jobs inside a database transaction: look up a replayed request, load
members, enforce "the payer must be a member", split the amount, and write rows. Business rules and the
transaction body were interleaved, and the idempotency lookup was written out twice (once inside the
transaction, once in the race-recovery `catch`) as two slightly different functions.

**Before** (excerpt):

```ts
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
      const members = await tx.groupMember.findMany({ where: { groupId }, orderBy: [...], select: { userId: true } });
      if (!members.some((m) => m.userId === input.paidById)) {
        throw new HttpError(422, "payer_not_member", "The payer must be a member of this group.");
      }
      const shares = splitEven(input.amountCents, members.map((m) => m.userId));
      const created = await tx.expense.create({ data: { /* ... */ shares: { create: shares } }, include: withShares });
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
```

**After:**

```ts
/** Returns the already-stored expense for a retried Idempotency-Key, or null on first use. */
async function findReplay(db: Tx, groupId: string, idempotencyKey: string): Promise<ExpenseDto | null> { /* ... */ }

/** Loads member ids in join order and checks the payer belongs to the group. */
async function resolveShares(tx: Tx, groupId: string, input: CreateExpenseInput): Promise<Share[]> { /* ... */ }

export async function createEvenExpense(db: Db, cmd: CreateExpenseCommand): Promise<CreateExpenseResult> {
  // ...
    return await db.$transaction(async (tx) => {
      if (idempotencyKey) {
        const replayed = await findReplay(tx, groupId, idempotencyKey);
        if (replayed) return { expense: replayed, replayed: true };
      }
      const shares = await resolveShares(tx, groupId, input);
      const created = await tx.expense.create({ /* ... */ });
      return { expense: toExpenseDto(created), replayed: false };
    });
  // catch: the same findReplay(db, ...) instead of a second lookup function
}
```

**Safety net.** The existing API unit and integration tests, including the five-request idempotency
race, ran green in CI on PR #12. **Payoff in D3:** US-04 only had to change `resolveShares` to support percent and custom
splits. The transaction body didn't change at all.

---

## 2 · Component doing too much → Extract Hook + Extract Component (`GroupScreen`)

**Smell.** The 240-line `GroupScreen` owned **eleven** `useState` hooks: four for loading the group and
balances, seven for the add-expense form. It also did fetching, retry, pull-to-refresh, validation, saving
and all the layout. Any change to the form risked the balance list and the other way round.

**Before** (excerpt):

```tsx
export function GroupScreen() {
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [balances, setBalances] = useState<BalancesDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [paidById, setPaidById] = useState(DEV_USER_ID);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const load = useCallback(async () => { /* api.getGroup + api.getBalances */ }, []);
  const onSave = useCallback(async () => { /* validate, api.addExpense, reset form */ }, [/* ... */]);
  // ... 150 more lines of JSX and styles for both the list and the form
}
```

**After:** `GroupScreen` is 71 lines of layout. The fetching moved to `hooks/useGroupData.ts`, the list to
`components/BalanceList.tsx`, and the form (with its own state) to `components/ExpenseForm.tsx`:

```tsx
export function GroupScreen({ groupId }: { groupId?: string } = {}) {
  const { group, balances, loadError, refreshing, reload, onRefresh, setBalances } = useGroupData(activeGroupId);
  // ... loading / error state ...
  return (
    <ScrollView /* ... */>
      <BalanceList balances={balances.balances} />
      <ExpenseForm groupId={activeGroupId} members={group.members} onExpenseSaved={setBalances} />
    </ScrollView>
  );
}
```

**Safety net.** Typecheck, the mobile unit tests and the Metro bundle, all green in CI on PR #12. **Payoff in D3:** US-06 and
US-07 added three cards (`SettleUpCard`, `PendingSettlementsCard`, `InviteCard`) to the group screen
without touching the form, and US-04 rewrote the form without touching the screen.

---

## 3 · Duplicated code + deep nesting → Reuse the existing service (`GET /users/me/groups`)

**Smell.** PR #14 added the home-screen endpoint by copying the three balance queries and the
`computeBalances` call from `balances.service.ts` into the route handler, nested three callbacks deep
(`router.get` → `memberships.map(async …)` → `Promise.all([...])`). Two copies of "how a balance is
computed" will drift: the next change to the formula would update one and silently miss the other, and
the home screen would show a different number than the group screen.

**Before** (`userGroups.routes.ts`, excerpt):

```ts
router.get("/groups", async (_req, res) => {
  const userId = res.locals.user.id;
  const memberships = await db.groupMember.findMany({ where: { userId }, /* ... */ include: { group: true } });

  const summaries = await Promise.all(
    memberships.map(async (membership) => {
      const [members, paid, shares] = await Promise.all([
        db.groupMember.findMany({ where: { groupId: membership.groupId }, /* same as balances.service.ts */ }),
        db.expense.groupBy({ by: ["paidById"], where: { groupId: membership.groupId }, _sum: { amountCents: true } }),
        db.expenseShare.groupBy({ by: ["userId"], where: { expense: { groupId: membership.groupId } }, _sum: { shareCents: true } }),
      ]);
      const paidByUser = new Map(paid.map((row) => [row.paidById, row._sum.amountCents ?? 0]));
      const shareByUser = new Map(shares.map((row) => [row.userId, row._sum.shareCents ?? 0]));
      const balances = computeBalances(members.map(/* ... */), paidByUser, shareByUser);
      const myBalance = balances.find((b) => b.userId === userId);
      return { groupId: membership.groupId, groupName: membership.group.name, netCents: myBalance?.netCents ?? 0 };
    }),
  );
  res.json({ groups: summaries });
});
```

**After:** the route is an HTTP adapter, and a new `listMyGroupSummaries` reuses `getGroupBalances`:

```ts
// userGroups.routes.ts
router.get("/groups", async (_req, res) => {
  const body: UserGroupsDto = { groups: await listMyGroupSummaries(db, res.locals.user.id) };
  res.json(body);
});

// userGroups.service.ts
export async function listMyGroupSummaries(db: Db, userId: string): Promise<GroupSummaryDto[]> {
  const memberships = await db.groupMember.findMany({ where: { userId }, /* ... */ });
  return Promise.all(
    memberships.map(async ({ groupId, group }) => {
      const { balances } = await getGroupBalances(db, groupId);
      const mine = balances.find((b) => b.userId === userId);
      return { groupId, groupName: group.name, netCents: mine?.netCents ?? 0 };
    }),
  );
}
```

**Safety net.** The endpoint had no tests, so we wrote five first (`test/userGroups.api.test.ts`, commit
`60c51d9`: join order, own net per group, matches the group endpoint, tenant isolation, empty list, 401).
They passed against the old code, then again after the refactor (`27a3578`).

**Payoff in D3, one story later.** US-07 changed the balance formula to
`paid − share + sent − received` (confirmed settlements). That was a change to `getGroupBalances` only,
and the home screen picked it up automatically. The test "the home screen sees confirmed settlements
too" in `settlements.api.test.ts` proves it. With the copy still in place, the home screen would have
kept the old formula and shown the wrong balance after every settlement.

---

## 4 · Duplicated code → Move to shared module (`HomeScreen` colors)

**Smell.** `HomeScreen.tsx` declared its own copy of the eight-color palette that already lived in
`theme.ts`, and repeated the "green if owed, red if owing, gray if settled" ternary from `BalanceList`. A
palette change would have missed one screen.

**Before** (`HomeScreen.tsx`):

```tsx
<Text style={[styles.net, g.netCents > 0 ? styles.owed : g.netCents < 0 ? styles.owes : styles.even]}>

const colors = { ink: "#1c1b1f", quiet: "#5f5d66", line: "#e3e1e8", /* ... same 8 values as theme.ts ... */ };
const styles = StyleSheet.create({
  /* ... */
  owed: { color: colors.owed },
  owes: { color: colors.owes },
  even: { color: colors.quiet },
});
```

**After:** one palette and one rule in `theme.ts`, used by both screens. The fetching also moved to a
`useMyGroups` hook, matching `useGroupData`:

```ts
// theme.ts
export function netColor(netCents: number): string {
  if (netCents > 0) return colors.owed;
  if (netCents < 0) return colors.owes;
  return colors.quiet;
}

// HomeScreen.tsx and BalanceList.tsx
<Text style={[styles.net, { color: netColor(g.netCents) }]}>{describeNet(g.netCents)}</Text>
```

**Safety net.** New unit test `theme.test.ts` for `netColor`, typecheck and the Metro bundle. The
rendered home screen is in the D3 report.
