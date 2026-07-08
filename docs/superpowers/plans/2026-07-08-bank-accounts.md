# Bank Accounts (F33) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** แทน "Kept (กรุงศรี)" ด้วยฟีเจอร์ "บัญชีธนาคาร" แบบ generic (card-first, หลายบัญชี, ยอดต่อเดือน, ไม่มีเป้าหมาย) โดย migrate ข้อมูล Kept เดิมอัตโนมัติและไม่ทำยอดเพี้ยน

**Architecture:** `BankAccount { id, name, balances[year][month] }` เป็น top-level field ของ `WealthLensData` (persist + Drive sync ฟรี, โครงเดียวกับ `keptBalances`). UI คัดลอกแพทเทิร์น card-first ของหน้าหนี้สิน (`LoansPage`/`LoanCard`/`LoanDetail`). Kept เดิม migrate เป็นบัญชี "กรุงศรี" (stable id) ตอน rehydrate; ตัวอ่าน Kept 5 จุด + gold dual-write repoint มาที่บัญชี.

**Tech Stack:** React 18 + TS strict, Zustand persist. ไม่มี test runner — "test" = `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts` สำหรับ pure logic; `npm run typecheck`/`build`/browser smoke สำหรับ UI.

**Reference (อ่านก่อนทำ UI):** หน้าหนี้สินเพิ่งทำเสร็จเป็นแม่แบบ card-first master-detail ที่ต้องเลียนแบบ — `src/pages/LoansPage.tsx`, `src/components/loans/{LoanCard,LoanDetail,LoanForm}.tsx`.

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|------|---------|-------|
| `src/utils/bankAccounts.ts` | pure helpers: migration + sum selectors + display helpers | ใหม่ |
| `scripts/verify-bank-accounts.ts` | verify migration/actions/gold/sum | ใหม่ |
| `src/types/index.ts` | +`BankAccount`, +`bankAccounts?` บน WealthLensData, +`accountId?` บน gold side-effect | แก้ |
| `src/stores/financeStore.ts` | 5 actions + migration ใน `merge` + gold repoint | แก้ |
| `src/stores/selectors.ts` | (optional) re-export bank sums | แก้ |
| `src/pages/BankAccountsPage.tsx` | orchestrator card-first | ใหม่ |
| `src/components/accounts/BankAccountCard.tsx` | การ์ดสรุปบัญชี | ใหม่ |
| `src/components/accounts/BankAccountDetail.tsx` | ตาราง 12 เดือน + แก้ยอด | ใหม่ |
| `src/components/accounts/BankAccountForm.tsx` | เพิ่ม/แก้ชื่อบัญชี | ใหม่ |
| `src/components/accounts/BankBalanceEditForm.tsx` | แก้ยอดเดือน (delta, reuse ที่หน้ารายเดือน) | ใหม่ |
| `src/components/layout/Sidebar.tsx` | nav 🏦 | แก้ |
| `src/App.tsx` | route `/accounts` | แก้ |
| `src/components/forms/SavingsList.tsx` | Kept row → bank rows | แก้ |
| `src/components/dashboard/KpiCardGrid.tsx` | Kept KPI → bank sum, ลบ SavingsGoalCard mount ถ้าอยู่ที่นี่ | แก้ |
| `src/components/dashboard/MonthlySummaryTable.tsx` | Kept column → bank sum | แก้ |
| `src/components/analytics/AllYearsSummary.tsx` | Kept totals → bank sum | แก้ |
| `src/pages/OverviewPage.tsx` | ลบ `<SavingsGoalCard>` | แก้ |
| `src/components/forms/GoldForm.tsx` | ซ่อนตัวเลือก 'kept' เมื่อไม่มีบัญชี | แก้ |
| `features.json`, `CLAUDE.md` | F33 + note | แก้ |

**ค่าคงที่:** `KRUNGSRI_ACCOUNT_ID = 'acct-krungsri'` (ใน `utils/bankAccounts.ts`, ใช้ทั้ง migration + gold).

---

## Task 1: Types + pure helpers + verify (data layer, no store yet)

**Files:** Create `src/utils/bankAccounts.ts`, `scripts/verify-bank-accounts.ts`; Modify `src/types/index.ts`.

- [ ] **Step 1: Add types** — in `src/types/index.ts`:
  - Add interface (near Loan / preferences):
    ```ts
    export interface BankAccount {
      /** UUID v4, or KRUNGSRI_ACCOUNT_ID for the migrated Kept account. */
      id: string;
      /** Free-form label, e.g. "กรุงศรี". */
      name: string;
      /** Net balance per month (+deposit / −withdraw). */
      balances: { [year: string]: { [month: string]: number } };
    }
    ```
  - Add `bankAccounts?: BankAccount[];` to `WealthLensData` (top-level, next to `loans?`).
  - On the gold side-effect refs type (the one with `keptYear?/keptMonth?/keptAmount?`), add `accountId?: string;` (so a repointed gold purchase records which account it hit). Keep `keptYear/keptMonth/keptAmount` for backward-compat reads.

- [ ] **Step 2: Write verify script FIRST** — Create `scripts/verify-bank-accounts.ts`:
```ts
/**
 * Verification for Bank Accounts (F33).
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts
 */
import {
  KRUNGSRI_ACCOUNT_ID,
  migrateKeptToBankAccounts,
  sumBankMonth,
  sumBankYear,
} from '../src/utils/bankAccounts';
import type { BankAccount } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- migration: keptBalances → บัญชีกรุงศรี, ยอดเท่าเดิม ---
const kept = { '2025': { '1': 10000, '2': -3000, '12': 5000 }, '2026': { '1': 2000 } };
const migrated = migrateKeptToBankAccounts({ preferences: { keptBalances: kept } } as never);
eq('สร้าง 1 บัญชี', migrated?.length, 1);
eq('id คงที่', migrated?.[0].id, KRUNGSRI_ACCOUNT_ID);
eq('ชื่อ กรุงศรี', migrated?.[0].name, 'กรุงศรี');
eq('ยอด 2025/1 เท่าเดิม', migrated?.[0].balances['2025']['1'], 10000);
eq('ยอดติดลบคงไว้', migrated?.[0].balances['2025']['2'], -3000);
eq('deep copy (ไม่ใช่ ref เดิม)', migrated?.[0].balances === (kept as never), false);

// ไม่มี keptBalances → undefined (ผู้ใช้ใหม่)
eq('ไม่มี Kept → undefined', migrateKeptToBankAccounts({ preferences: {} } as never), undefined);

// --- sum helpers รวมหลายบัญชี ---
const accounts: BankAccount[] = [
  { id: 'a', name: 'A', balances: { '2025': { '1': 100, '2': 200 } } },
  { id: 'b', name: 'B', balances: { '2025': { '1': 50 } } },
];
eq('sumBankMonth 2025/1', sumBankMonth(accounts, 2025, 1), 150);
eq('sumBankMonth 2025/2', sumBankMonth(accounts, 2025, 2), 200);
eq('sumBankYear 2025', sumBankYear(accounts, 2025), 350);
eq('sumBankYear empty', sumBankYear([], 2025), 0);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
```
Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts` → FAIL (module missing). Expected.

- [ ] **Step 3: Implement `src/utils/bankAccounts.ts`:**
```ts
/**
 * WealthLens — pure helpers for Bank Accounts (F33).
 * Migration from the legacy per-month `keptBalances` map + aggregate sums.
 * Pure/total: no throws, no Date.now, no mutation of inputs.
 */
import type { BankAccount, WealthLensData } from '@/types';

/** Stable id for the account migrated from Tom's Kept (กรุงศรี). */
export const KRUNGSRI_ACCOUNT_ID = 'acct-krungsri';

/** Deep-copy a year→month→number map. */
const cloneBalances = (
  src: { [year: string]: { [month: string]: number } } | undefined,
): BankAccount['balances'] => {
  const out: BankAccount['balances'] = {};
  for (const [y, months] of Object.entries(src ?? {})) {
    out[y] = { ...months };
  }
  return out;
};

/**
 * One-time migration: if legacy `preferences.keptBalances` has data, produce a
 * single "กรุงศรี" account carrying those balances (deep-copied). Returns
 * `undefined` when there's nothing to migrate (new users).
 */
export const migrateKeptToBankAccounts = (
  data: Pick<WealthLensData, 'preferences'>,
): BankAccount[] | undefined => {
  const kept = data.preferences?.keptBalances;
  if (!kept || Object.keys(kept).length === 0) return undefined;
  return [
    { id: KRUNGSRI_ACCOUNT_ID, name: 'กรุงศรี', balances: cloneBalances(kept) },
  ];
};

/** Sum one month across every account. */
export const sumBankMonth = (
  accounts: readonly BankAccount[],
  year: number,
  month: number,
): number =>
  accounts.reduce(
    (acc, a) => acc + (a.balances[String(year)]?.[String(month)] ?? 0),
    0,
  );

/** Sum a whole year (all 12 months) across every account. */
export const sumBankYear = (
  accounts: readonly BankAccount[],
  year: number,
): number =>
  accounts.reduce((acc, a) => {
    const yr = a.balances[String(year)] ?? {};
    return acc + Object.values(yr).reduce((s, v) => s + v, 0);
  }, 0);

/** Sum a single account's year (for its card / detail totals). */
export const accountYearTotal = (account: BankAccount, year: number): number => {
  const yr = account.balances[String(year)] ?? {};
  return Object.values(yr).reduce((s, v) => s + v, 0);
};

/** Latest month (1-12) in `year` that has a value, or null. */
export const latestMonthWithValue = (
  account: BankAccount,
  year: number,
): number | null => {
  const yr = account.balances[String(year)] ?? {};
  let latest: number | null = null;
  for (const k of Object.keys(yr)) {
    const m = Number(k);
    if (Number.isFinite(m) && (latest === null || m > latest)) latest = m;
  }
  return latest;
};
```

- [ ] **Step 4: Run verify → PASS.** `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts` → `✅ ALL PASS`.
- [ ] **Step 5: typecheck** → `npm run typecheck` clean.
- [ ] **Step 6: Commit**
```bash
git add src/types/index.ts src/utils/bankAccounts.ts scripts/verify-bank-accounts.ts
git commit -m "feat(accounts): BankAccount type + pure helpers + verify (F33)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 2: Store actions + migration hook

**Files:** Modify `src/stores/financeStore.ts`.

Context: the persist `merge` (around line 1454-1541) already returns `{ ...currentState, ...persisted, data: { ...data, years, ...(loans ? {loans} : {}) } }`. Add bankAccounts migration there. Actions mirror the loan actions (immutable `set`, bump `lastUpdated`).

- [ ] **Step 1: Add action type signatures** to the store's actions interface (near `addLoan`/`deleteLoan`):
```ts
addBankAccount: (name: string) => string;
renameBankAccount: (id: string, name: string) => void;
setBankBalance: (id: string, year: number, month: number, amount: number) => void;
clearBankBalance: (id: string, year: number, month: number) => void;
deleteBankAccount: (id: string) => void;
```

- [ ] **Step 2: Implement the actions** (place near the loan actions). Use `uuidv4()` (already imported) and `nowIso()`:
```ts
addBankAccount: (name) => {
  const id = uuidv4();
  set((state) => {
    const stamp = nowIso();
    const account = { id, name: name.trim(), balances: {} };
    return {
      data: {
        ...state.data,
        bankAccounts: [...(state.data.bankAccounts ?? []), account],
        lastUpdated: stamp,
      },
      lastUpdated: stamp,
    };
  });
  return id;
},

renameBankAccount: (id, name) =>
  set((state) => {
    const accounts = state.data.bankAccounts ?? [];
    if (!accounts.some((a) => a.id === id)) return state;
    const stamp = nowIso();
    return {
      data: {
        ...state.data,
        bankAccounts: accounts.map((a) =>
          a.id === id ? { ...a, name: name.trim() } : a,
        ),
        lastUpdated: stamp,
      },
      lastUpdated: stamp,
    };
  }),

setBankBalance: (id, year, month, amount) =>
  set((state) => {
    const accounts = state.data.bankAccounts ?? [];
    if (!accounts.some((a) => a.id === id)) return state;
    const yKey = String(year);
    const mKey = String(month);
    const stamp = nowIso();
    return {
      data: {
        ...state.data,
        bankAccounts: accounts.map((a) =>
          a.id === id
            ? {
                ...a,
                balances: {
                  ...a.balances,
                  [yKey]: { ...(a.balances[yKey] ?? {}), [mKey]: amount },
                },
              }
            : a,
        ),
        lastUpdated: stamp,
      },
      lastUpdated: stamp,
    };
  }),

clearBankBalance: (id, year, month) =>
  set((state) => {
    const accounts = state.data.bankAccounts ?? [];
    const target = accounts.find((a) => a.id === id);
    if (!target) return state;
    const yKey = String(year);
    const mKey = String(month);
    if (target.balances[yKey]?.[mKey] === undefined) return state;
    const stamp = nowIso();
    return {
      data: {
        ...state.data,
        bankAccounts: accounts.map((a) => {
          if (a.id !== id) return a;
          const nextYear = { ...(a.balances[yKey] ?? {}) };
          delete nextYear[mKey];
          return { ...a, balances: { ...a.balances, [yKey]: nextYear } };
        }),
        lastUpdated: stamp,
      },
      lastUpdated: stamp,
    };
  }),

deleteBankAccount: (id) =>
  set((state) => {
    const accounts = state.data.bankAccounts ?? [];
    if (!accounts.some((a) => a.id === id)) return state;
    const stamp = nowIso();
    return {
      data: {
        ...state.data,
        bankAccounts: accounts.filter((a) => a.id !== id),
        lastUpdated: stamp,
      },
      lastUpdated: stamp,
    };
  }),
```

- [ ] **Step 3: Migration in `merge`** — import at top of file: `import { migrateKeptToBankAccounts } from '@/utils/bankAccounts';`. In the `merge` return (the object at ~line 1536-1540), compute bankAccounts before the return:
```ts
const bankAccounts =
  data.bankAccounts ?? migrateKeptToBankAccounts(data);
return {
  ...currentState,
  ...persisted,
  data: {
    ...data,
    years,
    ...(loans ? { loans } : {}),
    ...(bankAccounts ? { bankAccounts } : {}),
  },
};
```
(Idempotent: once `data.bankAccounts` exists, migration never re-runs. Deep-copy in the helper means keptBalances is untouched.)

- [ ] **Step 4: verify + typecheck + build**
  - `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts` → still ✅ ALL PASS
  - `npm run typecheck` → clean; `npm run build` → success
- [ ] **Step 5: Commit**
```bash
git add src/stores/financeStore.ts
git commit -m "feat(accounts): store actions + keptBalances→bankAccounts migration (F33)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 3: BankAccountsPage (card-first) + sidebar + route

**Files:** Create `src/pages/BankAccountsPage.tsx`, `src/components/accounts/{BankAccountCard,BankAccountDetail,BankAccountForm,BankBalanceEditForm}.tsx`; Modify `src/components/layout/Sidebar.tsx`, `src/App.tsx`.

**Read first:** `src/pages/LoansPage.tsx`, `src/components/loans/{LoanCard,LoanDetail}.tsx`, and the existing `KeptEditForm` in `src/components/forms/SavingsList.tsx:147-292` (delta-based balance editor to mirror).

- [ ] **Step 1: `BankBalanceEditForm.tsx`** — a small form to edit one account-month balance. Mirror `KeptEditForm` (SavingsList.tsx:147-292): takes `accountId, year, month, current`, shows a delta input (+เข้า/−ออก) with a live preview of `current + delta`, saves via `setBankBalance(accountId, year, month, current + delta)`; a "ล้างยอด" path calls `clearBankBalance`. Props: `{ accountId, year, month, current, onSaved, onCancel }`.

- [ ] **Step 2: `BankAccountForm.tsx`** — create/rename. One text field (ชื่อบัญชี), required. `initialAccount?` undefined→create (`addBankAccount(name)`), set→rename (`renameBankAccount(id, name)`). Props `{ initialAccount?, onSaved, onCancel }`. Mirror the simple form shape of `ExtraPaymentForm` (styling) — much smaller than LoanForm.

- [ ] **Step 3: `BankAccountCard.tsx`** — mirror `LoanCard.tsx`. Props `{ account, year, onOpen }`. Show: name; big number = `latestMonthWithValue`→that month's balance (or `accountYearTotal(account, year)` if none), label "ยอดล่าสุด"/"รวมปีนี้"; a muted line "รวมปี {year}: {accountYearTotal}". NO progress bar / goal. Clickable → onOpen.

- [ ] **Step 4: `BankAccountDetail.tsx`** — the 12-month editor for one account + year. Read `year` from `useFinanceStore(s => s.selectedYear)`. Render a table of 12 rows (เดือน ม.ค.–ธ.ค. via `THAI_MONTHS_LONG`/`formatThaiMonth`), each showing the month's balance (or "+ ใส่ยอด") and a click-to-edit that opens `BankBalanceEditForm` in a `Modal`. Footer: รวมปี = `accountYearTotal`. Mirror the KeptRow interaction (SavingsList.tsx:316-363) per month. Props `{ account }`.

- [ ] **Step 5: `BankAccountsPage.tsx`** — COPY `src/pages/LoansPage.tsx` structure verbatim and adapt:
  - `loans` → `data.bankAccounts ?? []`; `LoanCard` → `BankAccountCard` (pass `year={selectedYear}`); `LoanDetail` → `BankAccountDetail`; `LoanForm` → `BankAccountForm`.
  - Actions: `deleteLoan`→`deleteBankAccount(id)` (no options); add/edit via `BankAccountForm`.
  - Header: "🏦 บัญชีธนาคาร" + subtitle "ยอดเงินออมแต่ละบัญชี รายเดือน" + "+ เพิ่มบัญชี".
  - Empty state: "+ เพิ่มบัญชี" (NO "load sample" — Kept migrates automatically; no seed button).
  - Delete confirm: "ลบบัญชี {name} และยอดทั้งหมด?" (no getRemainingBalance).
  - Keep the exact card-first master-detail logic (openId, detailLoan→detailAccount, back button "← บัญชีทั้งหมด").

- [ ] **Step 6: Sidebar** — in `src/components/layout/Sidebar.tsx` `NAV_ITEMS`, add after the loans item: `{ to: '/accounts', label: 'บัญชีธนาคาร', icon: '🏦' }`.

- [ ] **Step 7: Route** — in `src/App.tsx`, add a route `<Route path="/accounts" element={<BankAccountsPage />} />` mirroring the `/loans` route (lazy or eager — match how LoansPage is registered).

- [ ] **Step 8: typecheck + build + browser smoke**
  - `npm run typecheck && npm run build` → green
  - `npm run dev`, open `/accounts`: with migrated data → การ์ด "กรุงศรี" shows; click → 12-month table; edit a month → saves; add a 2nd account → 2 cards; rename; delete.
- [ ] **Step 9: Commit**
```bash
git add src/pages/BankAccountsPage.tsx src/components/accounts/ src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat(accounts): บัญชีธนาคาร page card-first + sidebar + route (F33)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 4: Monthly page (SavingsList) — Kept row → bank account rows

**Files:** Modify `src/components/forms/SavingsList.tsx`.

Context (SavingsList.tsx): today it renders one hardcoded `KeptRow` (line ~316-363) fed by `keptBalances` via goalsStore (lines 383-392), and the `total` (line 439-442) adds `keptMonthly`. Replace the single Kept row with one row per bank account, editing via `setBankBalance`.

- [ ] **Step 1: Swap data source** — replace the goalsStore Kept reads (lines ~383-388) with:
```ts
const accounts = useFinanceStore((s) => s.data.bankAccounts ?? []);
const setBankBalance = useFinanceStore((s) => s.setBankBalance);
const clearBankBalance = useFinanceStore((s) => s.clearBankBalance);
```
- [ ] **Step 2: Render one editable row per account** — replace the single `KeptRow` render + its modal with a `.map` over `accounts`, each rendering a row (reuse the `KeptRow` visual, renamed to a generic `BankBalanceRow`, or keep KeptRow but drive it per account) showing that account's `balances[year][month]` and its annual total; clicking opens a `Modal` with `BankBalanceEditForm` (from Task 3) for that `(account.id, year, month)`. Track which account's modal is open with `const [editAccountId, setEditAccountId] = useState<string | null>(null)`.
- [ ] **Step 3: Total** — change `total` (line ~439-442) to add `sumBankMonth(accounts, year, month)` instead of `keptMonthly`:
```ts
const total = useMemo(
  () => items.reduce((acc, it) => acc + it.amount, 0) + sumBankMonth(accounts, year, month),
  [items, accounts, year, month],
);
```
- [ ] **Step 4: Remove now-unused** goalsStore Kept imports (`useGoalsStore` kept parts, `sumAnnualKept`) if nothing else in the file uses them. Import `sumBankMonth` from `@/utils/bankAccounts`.
- [ ] **Step 5: typecheck + build + browser smoke** — on the Monthly page, each bank account shows a row with the month's balance; editing saves; total includes accounts; empty (no accounts) shows no rows and total = savings items only.
- [ ] **Step 6: Commit**
```bash
git add src/components/forms/SavingsList.tsx
git commit -m "feat(accounts): หน้ารายเดือนแก้ยอดบัญชีธนาคาร (แทน Kept row) (F33)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 5: Rewire Kept readers + remove savings goal

**Files:** Modify `src/components/dashboard/{KpiCardGrid,MonthlySummaryTable}.tsx`, `src/components/analytics/AllYearsSummary.tsx`, `src/pages/OverviewPage.tsx`. (Confirm where `SavingsGoalCard` is mounted with `grep -rn "SavingsGoalCard" src`.)

- [ ] **Step 1: Remove `SavingsGoalCard`** — find its mount (`grep -rn "SavingsGoalCard" src`) and remove the JSX + import from that page (likely `OverviewPage.tsx` or `KpiCardGrid.tsx`). Do NOT delete the component file yet (leave it; unused import removal only) — actually delete the file only if nothing imports it after removal; otherwise leave it. Prefer: remove the mount + import; if the file becomes orphaned, delete `src/components/dashboard/SavingsGoalCard.tsx`.
- [ ] **Step 2: KpiCardGrid Kept KPI** — the Kept KPI (reads `sumAnnualKept(keptBalances[year])`, ~lines 60-62) → change to `sumBankYear(accounts, year)` vs previous year `sumBankYear(accounts, year-1)`; label the card "ธนาคาร" (or "เงินออมธนาคาร"). Source `const accounts = useFinanceStore(s => s.data.bankAccounts ?? [])`. Import `sumBankYear` from `@/utils/bankAccounts`.
- [ ] **Step 3: MonthlySummaryTable Kept column** — the per-month Kept value (from `keptBalances`, ~lines 144-149, passed into `buildPayloads`) → `sumBankMonth(accounts, year, month)`; rename the column header from "Kept"/"กรุงศรี" to "ธนาคาร". Update the CSV header the same way if this column is in the CSV.
- [ ] **Step 4: AllYearsSummary Kept totals** — the Kept per-year total (`keptBalances`, ~lines 127/142/285) → `sumBankYear(accounts, year)`; rename display "Kept"→"ธนาคาร".
- [ ] **Step 5: typecheck + build** → green. Browser: Overview has no goal card; KPI shows bank total; monthly summary "ธนาคาร" column matches account balances; analytics totals match.
- [ ] **Step 6: Commit**
```bash
git add src/components/dashboard/KpiCardGrid.tsx src/components/dashboard/MonthlySummaryTable.tsx src/components/analytics/AllYearsSummary.tsx src/pages/OverviewPage.tsx
git commit -m "feat(accounts): rewire ตัวอ่าน Kept → bankAccounts + ตัดเป้าหมายออม (F33)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 6: Gold 'kept' side-effect → bank account

**Files:** Modify `src/stores/financeStore.ts` (addGoldHolding + delete/edit revert), `src/components/forms/GoldForm.tsx`, and extend the gold verify assertions in `scripts/verify-bank-accounts.ts`.

Context: `addGoldHolding` (financeStore ~658-749) when `paymentMethod !== 'cash'` decrements `keptBalances[year][month]` and stores `sideEffects.keptYear/keptMonth/keptAmount`. Revert path (~815-836) re-adds to keptBalances.

- [ ] **Step 1: Add gold verify assertions FIRST** (extend `scripts/verify-bank-accounts.ts`) — model a purchase decrement + revert against a bankAccounts array (pure-simulate the arithmetic the store will do): assert that decrementing `KRUNGSRI_ACCOUNT_ID` month balance by cost then re-adding returns to the original. (Since store logic isn't pure, assert via the helper math: `balances[y][m] - cost` then `+ cost === original`.) Keep it a focused arithmetic guard. Run → still PASS.

- [ ] **Step 2: Repoint decrement** — in `addGoldHolding`, replace the `keptBalances` branch (~717-737) so that when `paymentMethod !== 'cash'` it decrements the **กรุงศรี** account's balance:
  - find `const acct = (state.data.bankAccounts ?? []).find(a => a.id === KRUNGSRI_ACCOUNT_ID)`.
  - if found: compute `current = acct.balances[yKey]?.[mKey] ?? 0`, write `current - totalCost` into a new bankAccounts array (immutable), and set `holding.sideEffects = { accountId: KRUNGSRI_ACCOUNT_ID, keptYear: year, keptMonth: month, keptAmount: totalCost }`.
  - if NOT found: this shouldn't happen because GoldForm hides 'kept' when no accounts (Step 4). As a safety net, fall back to leaving no side-effect (do not touch keptBalances). Import `KRUNGSRI_ACCOUNT_ID` from `@/utils/bankAccounts`.
- [ ] **Step 3: Repoint revert** — in the delete/edit revert (~815-836) that restores Kept: when `se.accountId` (or legacy `se.keptYear/keptMonth/keptAmount`) is present, add `se.keptAmount` back to that account's `balances[keptYear][keptMonth]` (target `se.accountId ?? KRUNGSRI_ACCOUNT_ID`). Immutable update of bankAccounts. Keep reading the legacy `keptYear/keptMonth/keptAmount` fields (older holdings won't have `accountId`).
- [ ] **Step 4: GoldForm** — in `src/components/forms/GoldForm.tsx`, the paymentMethod control: hide/disable the 'kept' option when `(data.bankAccounts ?? []).length === 0`. When shown, relabel it "หักจากบัญชีกรุงศรี" (or keep "Kept"). `grep -n "kept\|paymentMethod" src/components/forms/GoldForm.tsx` to find the control.
- [ ] **Step 5: verify + typecheck + build + browser smoke** — buy gold with 'kept' → กรุงศรี balance drops in /accounts + monthly page; delete that gold → balance restored. `verify-bank-accounts.ts` → ✅ ALL PASS.
- [ ] **Step 6: Commit**
```bash
git add src/stores/financeStore.ts src/components/forms/GoldForm.tsx scripts/verify-bank-accounts.ts
git commit -m "feat(accounts): gold 'kept' ตัด/คืน ยอดบัญชีกรุงศรี แทน keptBalances (F33)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 7: features.json F33 + CLAUDE.md + final verify

**Files:** Modify `features.json`, `CLAUDE.md`.

- [ ] **Step 1: features.json** — add F33 to `phases[4].features` (status completed, phase phase_4, acceptanceCriteria covering: BankAccount model + migration, card-first page, monthly editing, removed goal, rewired readers, gold repoint, verify). Bump `progressSummary.totalFeatures`/`completed` 40→41.
- [ ] **Step 2: CLAUDE.md** — update the Data Quirks / decisions: note Kept is now generalized to `bankAccounts` (กรุงศรี = migrated account); the "เป้าหมายออม" goal was removed.
- [ ] **Step 3: Final verification**
  - `node -e "JSON.parse(require('fs').readFileSync('features.json','utf8'))"` OK
  - `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts` → ✅ ALL PASS
  - `npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts` + `verify-income-totals.ts` → still ✅ (no regression)
  - `npm run typecheck && npm run build` → green
- [ ] **Step 4: Commit**
```bash
git add features.json CLAUDE.md
git commit -m "docs: mark F33 bank accounts completed + CLAUDE.md Kept→bankAccounts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Definition of Done
- [ ] `verify-bank-accounts.ts` ✅ (migration ยอดเท่าเดิม + sums + gold arithmetic)
- [ ] Migration: เปิดแอปด้วยข้อมูล Tom เดิม → บัญชี "กรุงศรี" มียอดต่อเดือนเท่า Kept เดิมทุกช่อง
- [ ] /accounts card-first: เพิ่ม/แก้ชื่อ/ลบ/แก้ยอดรายเดือน ครบ
- [ ] หน้ารายเดือนแก้ยอดบัญชีได้ + total ถูก
- [ ] Overview ไม่มีเป้าหมายออม; KPI/ตารางสรุป/analytics แสดงผลรวมบัญชีถูก
- [ ] Gold 'kept' ตัด/คืน บัญชีกรุงศรีถูก; ซ่อน 'kept' เมื่อไม่มีบัญชี
- [ ] typecheck + build เขียว; verify multi-loan + income ไม่ regress
