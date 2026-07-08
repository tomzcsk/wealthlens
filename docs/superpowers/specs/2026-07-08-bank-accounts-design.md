# Design — บัญชีธนาคาร (Bank Accounts) แทน Kept

**วันที่:** 2026-07-08
**Feature id (ใหม่):** F33 — Bank Accounts (generalize Kept)
**สถานะ:** approved, รอเขียน implementation plan

---

## 1. ปัญหา

"Kept (กรุงศรี)" เป็นบัญชีออมเฉพาะตัวของ Tom — hardcode ทั้งชื่อ ธนาคาร และผูกกับ "เป้าหมายออม" ต่อปี (500,000). ผู้ใช้คนที่ 2 ไม่มี Kept/กรุงศรี และไม่มีเป้าหมายนี้ Tom จึงอยากเปลี่ยนเป็น **"บัญชีธนาคาร"** ที่ทุกคนสร้างเองได้ (card-first เหมือนหน้าหนี้สิน) โดย:
- Kept ปัจจุบันเก็บใน `preferences.keptBalances` (`{[year]:{[month]: number}}`) แยกจาก savings items
- มี 5 จุดที่อ่าน keptBalances + มี gold dual-write (`paymentMethod: 'kept'`) ผูกอยู่

**เป้าหมาย:** แทน Kept ด้วย Bank Accounts แบบ generic — สร้างหลายบัญชีได้, ยอดต่อเดือน, card-first, ไม่มีเป้าหมาย, และ **ข้อมูล Kept เดิมของ Tom migrate อัตโนมัติ ยอดไม่เพี้ยน**.

---

## 2. Data model

### 2.1 Type ใหม่ (`src/types/index.ts`)
```ts
export interface BankAccount {
  /** UUID v4 (หรือ stable id สำหรับบัญชี migrate) */
  id: string;
  /** ชื่อบัญชี free-form เช่น "กรุงศรี", "กสิกร" */
  name: string;
  /** ยอด net ต่อเดือน (+ฝาก / −ถอน) — โครงเดียวกับ keptBalances เดิม */
  balances: { [year: string]: { [month: string]: number } };
}
```
เพิ่ม `bankAccounts?: BankAccount[]` ที่ top-level ของ `WealthLensData` (optional → persist + Drive sync ฟรี, backward-compat).

`keptBalances` ใน `UserPreferences` **คงไว้เป็น optional** (ไม่ลบ type) เพื่อ hydrate payload เก่า + เป็นแหล่ง migrate; หลัง migrate จะไม่ถูกอ่าน/เขียนอีก.

### 2.2 Migration (one-time, ตอน hydrate)
ใน rehydrate/normalize ของ financeStore: ถ้า `data.bankAccounts` ยังไม่มี **และ** `preferences.keptBalances` มีข้อมูล → สร้าง
```ts
{ id: KRUNGSRI_ACCOUNT_ID, name: 'กรุงศรี', balances: <deep copy ของ keptBalances> }
```
ใส่ลง `data.bankAccounts = [krungsriAccount]`. Idempotent (รันซ้ำไม่ซ้ำบัญชี — เช็ค id). `KRUNGSRI_ACCOUNT_ID` = ค่าคงที่ (เช่น `'acct-krungsri'`) เพื่อให้ gold dual-write อ้างถึงได้เสถียร.

ผู้ใช้ใหม่ (ไม่มี keptBalances) → `bankAccounts` ว่าง → empty state.

---

## 3. Store actions (`src/stores/financeStore.ts`)

| Action | พฤติกรรม |
|--------|----------|
| `addBankAccount(name): string` | สร้างบัญชีใหม่ (uuid, balances ว่าง), return id |
| `renameBankAccount(id, name)` | แก้ชื่อ |
| `setBankBalance(id, year, month, amount)` | ตั้งยอด net ของเดือนนั้น (ไม่ clamp — ติดลบได้) |
| `clearBankBalance(id, year, month)` | ลบยอดเดือนนั้น |
| `deleteBankAccount(id)` | ลบบัญชี (+ ยอดทั้งหมด) |

ทั้งหมด immutable update ผ่าน `set` + bump `lastUpdated` (pattern เดียวกับ loan/gold actions). ไม่แตะบัญชีอื่น.

goalsStore Kept actions (`setKeptBalance`/`clearKeptBalance`/`sumAnnualKept`) → retire หลัง rewire (หรือคง `sumAnnualKept` เป็น pure helper ถ้ายังใช้กับ balances map).

---

## 4. UI

### 4.1 เมนู + หน้า `src/pages/BankAccountsPage.tsx` (card-first master-detail)
- Sidebar: เพิ่ม `{ to: '/accounts', label: 'บัญชีธนาคาร', icon: '🏦' }`
- โครงเดียวกับ `LoansPage` (card-first เสมอ):
  - **การ์ดบัญชี** (`BankAccountCard.tsx`): ชื่อ + ยอดเดือนล่าสุดที่มีข้อมูล + ยอดรวมปีที่เลือก
  - คลิก → **detail** (`BankAccountDetail.tsx`): ตาราง 12 เดือนของปีที่เลือก, แก้ยอดแต่ละเดือน (reuse ฟอร์มแก้ยอด), ปุ่ม "← บัญชีทั้งหมด" + แก้ชื่อ/ลบ
  - "+ เพิ่มบัญชี" (ฟอร์มแค่ชื่อ) · empty state
  - **ไม่มีเป้าหมาย/progress bar**
- ผูกกับ year selector ปัจจุบัน (แสดงปีที่เลือกใน header)

### 4.2 หน้ารายเดือน `SavingsList.tsx` — คงการแก้ยอดไว้
- แทน `KeptRow` (hardcode Kept) → render **หนึ่ง row ต่อบัญชีธนาคาร** (ยอดเดือนนั้น), แก้ inline ผ่านฟอร์ม delta เดิม (repoint `KeptEditForm` → `setBankBalance(accountId, ...)`)
- footer `รวมออม` = savings items + ผลรวมทุกบัญชีเดือนนั้น (เดิมบวก keptMonthly → เปลี่ยนเป็นผลรวมบัญชี)
- savings items (Dime/ออมเที่ยว ฯลฯ) ไม่แตะ

### 4.3 ตัดเป้าหมายออม
- เอา `SavingsGoalCard` ออกจาก Overview (`OverviewPage`/`KpiCardGrid` ที่ mount มัน)
- `yearlyGoals` + `setYearlyGoal` → เลิกใช้ (คง type ไว้ backward-compat, ไม่ลบ field)

---

## 5. Rewire ตัวอ่าน Kept เดิม → รวมทุกบัญชี

helper ใหม่ (pure): `sumBankMonth(accounts, year, month)` และ `sumBankYear(accounts, year)` (รวมทุกบัญชี).

| จุด | เดิม | ใหม่ |
|-----|------|------|
| `SavingsGoalCard` | Kept vs goal | **ลบทิ้ง** (§4.3) |
| `KpiCardGrid` Kept KPI | sumAnnualKept | ผลรวมทุกบัญชีปีนี้ vs ปีก่อน (label → "ธนาคาร") |
| `MonthlySummaryTable` Kept column | keptBalances[y][m] | `sumBankMonth` (header → "ธนาคาร") |
| `AllYearsSummary` Kept totals | keptBalances | `sumBankYear` |
| `SavingsList` row + total | KeptRow | §4.2 |

---

## 6. Gold dual-write (paymentMethod 'kept') ⚠️

ปัจจุบัน: ซื้อทองด้วย `paymentMethod: 'kept'` → ตัด `keptBalances[year][month]`, เก็บ `GoldSideEffectRefs.keptYear/keptMonth/keptAmount` เพื่อ revert.

ใหม่: ตัดยอด **บัญชีกรุงศรี** (`KRUNGSRI_ACCOUNT_ID`) แทน — `bankAccounts[krungsri].balances[year][month] -= amount`. Side-effect refs เก็บ `accountId` + year/month/amount. revert (ลบ/แก้ทอง) → คืนยอดบัญชีนั้น.
- migrate: gold entry เก่าที่ paymentMethod 'kept' — refs เดิมชี้ปี/เดือน; หลัง migrate ปี/เดือนเดียวกันอยู่ในบัญชีกรุงศรีอยู่แล้ว → revert ยังถูกต้อง (map 'kept' → krungsri id)
- ถ้าไม่มีบัญชีกรุงศรี (ผู้ใช้ใหม่ที่ไม่มี Kept แต่กดจ่ายทองด้วย kept) → fallback: สร้างบัญชีกรุงศรี หรือ disable ตัวเลือก 'kept' เมื่อไม่มีบัญชี (**เลือก: ซ่อนตัวเลือก 'kept' ใน GoldForm เมื่อไม่มีบัญชีธนาคาร**)

**นอก scope:** ให้ gold เลือกบัญชีจ่ายได้อิสระ (v1 คงเป็นกรุงศรี/บัญชีแรก).

---

## 7. Backward-compat & data safety

- schema เพิ่มแบบ optional → payload เก่า hydrate ได้
- migration idempotent, deep-copy keptBalances (ไม่ mutate ของเดิม), ยอดต่อเดือน/ปีต้องเท่า keptBalances เป๊ะ
- `keptBalances` ไม่ถูกลบออกจาก type (กัน payload เก่าพัง) แต่เลิกอ่านหลัง migrate
- Drive sync: `bankAccounts` เป็น field ของ `data` → sync อัตโนมัติ scope drive.file เท่าเดิม

---

## 8. Verification (`scripts/verify-bank-accounts.ts`)

- migrate `SEED_KEPT_BALANCES` (หรือ keptBalances ตัวอย่าง) → บัญชีกรุงศรี: assert `sumBankYear` แต่ละปี == `sumAnnualKept` เดิม, และยอดต่อเดือนตรงทุกช่อง
- `addBankAccount`/`setBankBalance`/`deleteBankAccount` ทำงานถูก ไม่แตะบัญชีอื่น
- gold 'kept' side-effect: ซื้อ → บัญชีกรุงศรีลดลง, revert → คืนเท่าเดิม
- `sumBankMonth`/`sumBankYear` รวมหลายบัญชีถูก
- typecheck + build + browser smoke (เพิ่มบัญชี → แก้ยอด → ลบ, และหน้ารายเดือนแก้ยอดได้)

---

## 9. ไฟล์ที่แตะ (สรุป — รายละเอียดใน plan)

**ใหม่:** `pages/BankAccountsPage.tsx`, `components/accounts/{BankAccountCard,BankAccountDetail,BankAccountForm,BankBalanceEditForm}.tsx`, `utils/bankAccounts.ts` (pure helpers + migration), `scripts/verify-bank-accounts.ts`

**แก้:** `types/index.ts` (+BankAccount, bankAccounts field), `stores/financeStore.ts` (actions + migration + gold repoint), `stores/selectors.ts` (bank sum selectors), `components/layout/Sidebar.tsx` (nav), `App.tsx` (route), `components/forms/SavingsList.tsx` (Kept row → bank rows), `components/dashboard/{KpiCardGrid,MonthlySummaryTable}.tsx`, `components/analytics/AllYearsSummary.tsx`, `components/forms/GoldForm.tsx` + gold side-effect ใน financeStore, ลบ `SavingsGoalCard` ออกจาก Overview

**ไม่แตะ:** savings items model (Dime/ออมเที่ยว/gold ledger), income/loans, expense
