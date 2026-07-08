# Multi-loan + User-created Loans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้สร้าง/แก้/ลบ หนี้ได้ทุกประเภทและเก็บได้หลายก้อน โดยไม่แตะ schema และไม่กระทบข้อมูล กยศ เดิมของ Tom

**Architecture:** Store layer (`addLoan`/`updateLoan`/`deleteLoan` + `LoanInput`/`LoanPatch`) **มีอยู่ครบแล้วในโค้ด** — งานทั้งหมดอยู่ที่ UI: (1) pure helper สร้าง/finalize ตารางงวด, (2) `LoanForm` สร้าง/แก้, (3) แตก `LoanDetail` ออกจาก `LoansPage`, (4) refactor `LoansPage` เป็น multi-loan orchestrator, (5) verify script พิสูจน์ helper + ความปลอดภัยของ seed กยศ.

**Tech Stack:** React 18 + TypeScript strict, Zustand, Tailwind. Repo ไม่มี unit-test runner — "test" = verify script รันด้วย `npx tsx --tsconfig tsconfig.app.json` (ดู `scripts/verify-*.ts`) สำหรับ pure logic, และ `npm run typecheck` + `npm run build` + browser smoke สำหรับ UI.

**หมายเหตุความถูกต้อง:** spec เดิม (ข้อ 3) เขียนไว้ว่า "ต้องเพิ่ม `addLoan`/`updateLoan`" — ตรวจโค้ดจริงแล้ว **มีครบแล้ว** (`financeStore.ts:280,289` + types `:139,148`). Plan นี้จึงไม่แตะ store เลย ใช้ของเดิม

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|------|---------|-------|
| `src/utils/loanForm.ts` | pure helper: scaffold ตารางงวดจาก (วันเริ่ม, จำนวนงวด, ความถี่) + finalize (คิด totalAmount/principalRatio) | **สร้างใหม่** |
| `scripts/verify-multi-loan.ts` | verify helper + ความปลอดภัย seed กยศ | **สร้างใหม่** |
| `src/components/loans/LoanForm.tsx` | form สร้าง/แก้ หนี้ + ตารางงวดแก้ได้ทุกแถว | **สร้างใหม่** |
| `src/components/loans/LoanDetail.tsx` | แสดง 1 ก้อน (hero + this-year + tables + payment modals) — แตกจาก LoansPage | **สร้างใหม่** |
| `src/pages/LoansPage.tsx` | orchestrator: list/pills, add/edit/delete, empty state | **refactor** |
| `features.json` | เพิ่ม F31 | **แก้** |

ไม่แตะ: `types/index.ts`, `stores/financeStore.ts`, `data/seedData.ts`, `utils/loanCalculations.ts`, `components/loans/{LoanScheduleTable,PaymentLogTable,ExtraPaymentForm}.tsx`, `Sidebar.tsx`, `LoanSummaryCard.tsx`.

---

## Task 1: Pure schedule-builder helpers (`loanForm.ts`)

สร้าง pure functions ที่ form จะใช้ — ทำ TDD ผ่าน verify script ก่อน เพราะ logic วันที่/ratio มี edge case (month overflow, ผลรวมต้น = 0)

**Files:**
- Create: `src/utils/loanForm.ts`
- Test: `scripts/verify-multi-loan.ts`

- [ ] **Step 1: เขียน verify script (ยังไม่มี module → fail)**

Create `scripts/verify-multi-loan.ts`:

```ts
/**
 * Verification for multi-loan + user-created loans (F31).
 * Repo has no test runner — run with:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts
 */
import { gslLoan } from '../src/data/seedData';
import { getLoanSummary, getScheduleTotal } from '../src/utils/loanCalculations';
import { scaffoldSchedule, finalizeSchedule } from '../src/utils/loanForm';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(actual)} (expected ${String(expected)})`);
};
const expectClose = (label: string, actual: number, expected: number): void => {
  const ok = Math.abs(actual - expected) < 1e-6;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual} (expected ~${expected})`);
};

// --- scaffoldSchedule: monthly ---
const m = scaffoldSchedule('2026-01-15', 3, 'monthly');
expectEq('monthly count', m.length, 3);
expectEq('monthly row1 num', m[0].installmentNumber, 1);
expectEq('monthly row1 due', m[0].dueDate, '2026-01-15');
expectEq('monthly row2 due', m[1].dueDate, '2026-02-15');
expectEq('monthly row3 due', m[2].dueDate, '2026-03-15');
expectEq('monthly row1 principal=0', m[0].principalAmount, 0);
expectEq('monthly row1 total=0', m[0].totalAmount, 0);

// --- scaffoldSchedule: month-end clamp ---
const clamp = scaffoldSchedule('2026-01-31', 2, 'monthly');
expectEq('clamp row2 due (Feb)', clamp[1].dueDate, '2026-02-28');

// --- scaffoldSchedule: yearly ---
const y = scaffoldSchedule('2020-06-10', 2, 'yearly');
expectEq('yearly row2 due', y[1].dueDate, '2021-06-10');

// --- finalizeSchedule: totals + ratios ---
const fin = finalizeSchedule([
  { installmentNumber: 1, dueDate: '2026-01-15', principalAmount: 1000, interestAmount: 100 },
  { installmentNumber: 2, dueDate: '2026-02-15', principalAmount: 3000, interestAmount: 0 },
]);
expectEq('finalize row1 total', fin[0].totalAmount, 1100);
expectEq('finalize row2 total', fin[1].totalAmount, 3000);
expectClose('finalize row1 ratio', fin[0].principalRatio, 0.25);
expectClose('finalize row2 ratio', fin[1].principalRatio, 0.75);
expectClose('finalize ratio sum', fin[0].principalRatio + fin[1].principalRatio, 1);

// --- finalizeSchedule: zero-principal guard (ไม่ NaN) ---
const zero = finalizeSchedule([
  { installmentNumber: 1, dueDate: '2026-01-15', principalAmount: 0, interestAmount: 500 },
]);
expectEq('zero-principal ratio', zero[0].principalRatio, 0);
expectEq('zero-principal total', zero[0].totalAmount, 500);

// --- ความปลอดภัยของ seed กยศ (ไม่แตะ schema/seed/calc → ต้อง self-consistent) ---
expectEq('กยศ schedule 15 งวด', gslLoan.schedule.length, 15);
expectEq('กยศ scheduledPayments 22 rows', gslLoan.scheduledPayments.length, 22);
const summary = getLoanSummary(gslLoan);
const handTotal = gslLoan.schedule.reduce((a, i) => a + i.totalAmount, 0);
expectEq('กยศ scheduleTotal = hand-sum', summary.scheduleTotal, handTotal);
expectEq('กยศ scheduleTotal = getScheduleTotal', summary.scheduleTotal, getScheduleTotal(gslLoan));
expectEq('กยศ remaining >= 0', summary.remaining >= 0, true);
expectEq('กยศ progress in [0,1]', summary.progressFraction >= 0 && summary.progressFraction <= 1, true);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: รัน verify — ต้อง fail ที่ module ยังไม่มี**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts`
Expected: FAIL — `Cannot find module '../src/utils/loanForm'`

- [ ] **Step 3: เขียน `src/utils/loanForm.ts`**

```ts
/**
 * WealthLens — pure helpers for the loan create/edit form.
 *
 * The lender's schedule is authoritative (see LoanInstallment doc), but a
 * user hand-entering a loan has no portal export. These helpers let the
 * form (1) scaffold N evenly-dated rows they can then edit, and (2)
 * finalize the edited rows into full `LoanInstallment[]` with the
 * denormalised `totalAmount` / `principalRatio` the selectors expect.
 *
 * Pure + total: no throws, no Date.now dependence (dates derive from the
 * caller-supplied startDate).
 */
import type { LoanInstallment } from '@/types';

export type ScheduleFrequency = 'monthly' | 'yearly';

/** Editable row the form binds to — amounts only, ratios computed on finalize. */
export interface LoanScheduleDraftRow {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
}

/** Last day of a given (year, month) — month is 1-based. */
const lastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/**
 * Step an ISO yyyy-mm-dd date forward by `n` periods, clamping the day to
 * the target month's last day (so 2026-01-31 + 1 month → 2026-02-28).
 */
const stepDate = (
  iso: string,
  n: number,
  frequency: ScheduleFrequency,
): string => {
  const [y, m, d] = iso.split('-').map(Number);
  let year = y;
  let month = m; // 1-based
  if (frequency === 'yearly') {
    year += n;
  } else {
    const zeroBased = m - 1 + n;
    year += Math.floor(zeroBased / 12);
    month = (zeroBased % 12) + 1;
  }
  const day = Math.min(d, lastDayOfMonth(year, month));
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
};

/**
 * Build `count` draft rows dated from `startDate` (row 1 = startDate,
 * subsequent rows +1 period). Amounts start at 0 for the user to fill.
 */
export const scaffoldSchedule = (
  startDate: string,
  count: number,
  frequency: ScheduleFrequency,
): LoanScheduleDraftRow[] => {
  const n = Math.max(0, Math.floor(count));
  const rows: LoanScheduleDraftRow[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      installmentNumber: i + 1,
      dueDate: stepDate(startDate, i, frequency),
      principalAmount: 0,
      interestAmount: 0,
    });
  }
  return rows;
};

/**
 * Convert edited draft rows into full `LoanInstallment[]`:
 *   totalAmount   = principalAmount + interestAmount
 *   principalRatio = principalAmount / Σ(principalAmount)  (0 when sum is 0)
 * installmentNumber is re-sequenced 1..N in the given order.
 */
export const finalizeSchedule = (
  rows: LoanScheduleDraftRow[],
): LoanInstallment[] => {
  const sumPrincipal = rows.reduce((a, r) => a + r.principalAmount, 0);
  return rows.map((r, idx) => ({
    installmentNumber: idx + 1,
    dueDate: r.dueDate,
    principalRatio: sumPrincipal > 0 ? r.principalAmount / sumPrincipal : 0,
    principalAmount: r.principalAmount,
    interestAmount: r.interestAmount,
    totalAmount: r.principalAmount + r.interestAmount,
  }));
};

/** Inverse of finalize — draft rows from an existing schedule (edit mode). */
export const scheduleToDraft = (
  schedule: LoanInstallment[],
): LoanScheduleDraftRow[] =>
  schedule.map((i) => ({
    installmentNumber: i.installmentNumber,
    dueDate: i.dueDate,
    principalAmount: i.principalAmount,
    interestAmount: i.interestAmount,
  }));
```

- [ ] **Step 4: รัน verify — ต้องผ่านหมด**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts`
Expected: PASS — `✅ ALL PASS`

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/utils/loanForm.ts scripts/verify-multi-loan.ts
git commit -m "feat(loans): pure schedule-builder helpers + verify (F31)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 2: `LoanForm.tsx` — create/edit form

Form เดียวใช้ทั้ง create (prop `initialLoan` = undefined) และ edit (prop `initialLoan` = Loan). เรียก `addLoan`/`updateLoan` ของ store ที่มีอยู่แล้ว

**Files:**
- Create: `src/components/loans/LoanForm.tsx`

- [ ] **Step 1: เขียน `LoanForm.tsx`**

```tsx
/**
 * WealthLens — create / edit a Loan (F31).
 *
 * ผู้ใช้ที่ไม่มี export จาก portal กรอกตารางงวดเอง: ระบุจำนวนงวด + ความถี่
 * → กด "สร้างตาราง" ได้แถวไล่วันที่ให้ → แก้ ต้น/ดอก/วันที่ ได้ทุกแถว.
 * ต้น+ดอก = totalAmount, principalRatio คิดให้ตอนบันทึก (utils/loanForm).
 *
 * create → addLoan(LoanInput); edit → updateLoan(id, LoanPatch). ทั้งสอง
 * action มีอยู่แล้วในสโตร์ และไม่แตะ scheduledPayments/extraPayments ของ
 * ก้อนเดิม (edit ส่งเฉพาะ name/type/startDate/schedule).
 */
import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { Loan, LoanType } from '@/types';
import { formatNumber } from '@/utils/formatters';
import {
  finalizeSchedule,
  scaffoldSchedule,
  scheduleToDraft,
  type LoanScheduleDraftRow,
  type ScheduleFrequency,
} from '@/utils/loanForm';

interface LoanFormProps {
  /** undefined = create; a Loan = edit that loan. */
  initialLoan?: Loan;
  onSaved: () => void;
  onCancel: () => void;
}

const TYPE_OPTIONS: { value: LoanType; label: string }[] = [
  { value: 'gsl', label: 'กยศ' },
  { value: 'mortgage', label: 'สินเชื่อบ้าน' },
  { value: 'auto', label: 'รถยนต์' },
  { value: 'other', label: 'อื่นๆ' },
];

const todayIso = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const toAmount = (s: string): number => {
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const LoanForm = ({
  initialLoan,
  onSaved,
  onCancel,
}: LoanFormProps): ReactNode => {
  const addLoan = useFinanceStore((s) => s.addLoan);
  const updateLoan = useFinanceStore((s) => s.updateLoan);
  const pushToast = useToastStore((s) => s.push);
  const isEdit = initialLoan != null;

  const [name, setName] = useState(initialLoan?.name ?? '');
  const [type, setType] = useState<LoanType>(initialLoan?.type ?? 'other');
  const [startDate, setStartDate] = useState(
    initialLoan?.startDate ?? todayIso(),
  );
  const [count, setCount] = useState('12');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('monthly');
  const [rows, setRows] = useState<LoanScheduleDraftRow[]>(
    initialLoan ? scheduleToDraft(initialLoan.schedule) : [],
  );
  const [error, setError] = useState<string | null>(null);

  const regenerate = (): void => {
    const c = Math.max(0, Math.floor(Number(count) || 0));
    if (c < 1) {
      setError('จำนวนงวดต้องอย่างน้อย 1');
      return;
    }
    setRows(scaffoldSchedule(startDate, c, frequency));
    setError(null);
  };

  const patchRow = (
    idx: number,
    field: keyof LoanScheduleDraftRow,
    value: string,
  ): void => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              [field]:
                field === 'dueDate' ? value : toAmount(value),
            }
          : r,
      ),
    );
  };

  const removeRow = (idx: number): void => {
    setRows((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((r, i) => ({ ...r, installmentNumber: i + 1 })),
    );
  };

  const scheduleTotal = rows.reduce(
    (a, r) => a + r.principalAmount + r.interestAmount,
    0,
  );

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรอกชื่อหนี้');
      return;
    }
    if (rows.length < 1) {
      setError('ต้องมีอย่างน้อย 1 งวด — กด "สร้างตาราง" ก่อน');
      return;
    }
    if (rows.some((r) => !r.dueDate)) {
      setError('ทุกงวดต้องมีวันครบกำหนด');
      return;
    }
    const schedule = finalizeSchedule(rows);

    if (isEdit && initialLoan) {
      updateLoan(initialLoan.id, {
        name: name.trim(),
        type,
        startDate,
        schedule,
      });
      pushToast({ message: 'แก้ไขหนี้แล้ว', tone: 'success' });
    } else {
      addLoan({ name: name.trim(), type, startDate, schedule });
      pushToast({ message: 'เพิ่มหนี้แล้ว', tone: 'success' });
    }
    onSaved();
  };

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
  const cellCls =
    'w-full rounded border border-slate-300 px-2 py-1 text-sm financial-number tabular-nums text-right focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm font-medium text-slate-700">
          ชื่อหนี้
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น สินเชื่อบ้าน"
            autoFocus
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          ประเภท
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LoanType)}
            className={inputCls}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <label className="block text-sm font-medium text-slate-700">
          วันเริ่มงวดแรก
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          จำนวนงวด
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          ความถี่
          <select
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as ScheduleFrequency)
            }
            className={inputCls}
          >
            <option value="monthly">รายเดือน</option>
            <option value="yearly">รายปี</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={regenerate}
        className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-light transition"
      >
        {rows.length > 0 ? 'สร้างตารางใหม่' : 'สร้างตาราง'}
      </button>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">งวด</th>
                <th className="px-2 py-2 text-left">ครบกำหนด</th>
                <th className="px-2 py-2 text-right">ต้น</th>
                <th className="px-2 py-2 text-right">ดอก</th>
                <th className="px-2 py-2 text-right">รวม</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="px-2 py-1 tabular-nums text-slate-500">
                    {r.installmentNumber}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="date"
                      value={r.dueDate}
                      onChange={(e) =>
                        patchRow(idx, 'dueDate', e.target.value)
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.principalAmount || ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        patchRow(idx, 'principalAmount', e.target.value)
                      }
                      className={cellCls}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.interestAmount || ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        patchRow(idx, 'interestAmount', e.target.value)
                      }
                      className={cellCls}
                    />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                    {formatNumber(r.principalAmount + r.interestAmount, {
                      decimals: 0,
                    })}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      aria-label={`ลบงวด ${r.installmentNumber}`}
                      className="text-slate-400 hover:text-expense"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-semibold">
              <tr>
                <td className="px-2 py-2" colSpan={4}>
                  รวมทั้งก้อน
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatNumber(scheduleTotal, { decimals: 0 })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหนี้'}
        </button>
      </div>
    </form>
  );
};

export default LoanForm;
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: ไม่มี error (ยืนยันว่า `addLoan`/`updateLoan` signatures + `LoanInput` ตรง)

- [ ] **Step 3: Commit**

```bash
git add src/components/loans/LoanForm.tsx
git commit -m "feat(loans): LoanForm สร้าง/แก้หนี้ทุกประเภท + ตารางงวดแก้ได้ (F31)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 3: `LoanDetail.tsx` — extract single-loan view from LoansPage

ย้ายส่วนแสดง 1 ก้อน (hero + this-year + schedule + payment log + modals เพิ่ม/ลบโปะ) ออกมาเป็น component รับ `loan` prop. **ยกโค้ดเดิมมาตรงๆ** ไม่เปลี่ยน logic

**Files:**
- Create: `src/components/loans/LoanDetail.tsx`
- Modify: `src/pages/LoansPage.tsx` (ชั่วคราว: import LoanDetail มาแทน body เดิม, ยังใช้ loans[0])

- [ ] **Step 1: สร้าง `LoanDetail.tsx`**

ยก `LoanHero`, `ThisYearCard` (จาก `LoansPage.tsx:42-187`), การ import `getLoanSummary`, `ExtraPaymentForm`, `LoanScheduleTable`, `PaymentLogTable`, `Modal`, และ block เพิ่ม/ลบโปะ (`LoansPage.tsx:243-361`) มาไว้ที่นี่ ห่อเป็น component เดียว:

```tsx
/**
 * WealthLens — one loan's full detail (hero + this-year + schedule + log).
 * Extracted from LoansPage so the page can orchestrate a list of loans
 * while this component owns everything about rendering a single loan and
 * its payment modals. Logic is unchanged from the original single-loan page.
 */
import { useMemo, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import ExtraPaymentForm from '@/components/loans/ExtraPaymentForm';
import LoanScheduleTable from '@/components/loans/LoanScheduleTable';
import PaymentLogTable from '@/components/loans/PaymentLogTable';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { Loan } from '@/types';
import { getLoanSummary } from '@/utils/loanCalculations';
import {
  formatNumber,
  formatPercent,
  formatTHB,
  formatThaiMonthYear,
} from '@/utils/formatters';

// [ยก LoanHero + ThisYearCard จาก LoansPage.tsx:36-187 มาวางที่นี่ครบทุกบรรทัด]
// (LoanHero รับ { loan, summary, onAddExtra }; ThisYearCard รับ { summary })

interface LoanDetailProps {
  loan: Loan;
}

export const LoanDetail = ({ loan }: LoanDetailProps): ReactNode => {
  const deleteExtraPayment = useFinanceStore((s) => s.deleteExtraPayment);
  const pushToast = useToastStore((s) => s.push);

  const summary = useMemo(() => getLoanSummary(loan), [loan]);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDeleteExtra, setPendingDeleteExtra] = useState<string | null>(
    null,
  );

  const handleDeleteExtra = (revert: boolean): void => {
    if (!pendingDeleteExtra) return;
    deleteExtraPayment(loan.id, pendingDeleteExtra, {
      revertExpenseSideEffect: revert,
    });
    setPendingDeleteExtra(null);
    pushToast({
      message: revert
        ? 'ลบโปะ + revert ค่าใช้จ่ายเดือนนั้นแล้ว'
        : 'ลบโปะแล้ว (เก็บค่าใช้จ่ายเดือนนั้นไว้)',
      tone: 'info',
    });
  };

  const pendingExtra = pendingDeleteExtra
    ? loan.extraPayments.find((e) => e.id === pendingDeleteExtra) ?? null
    : null;

  return (
    <div className="space-y-6">
      <LoanHero loan={loan} summary={summary} onAddExtra={() => setAddOpen(true)} />
      <ThisYearCard summary={summary} />
      <LoanScheduleTable loan={loan} />
      <PaymentLogTable
        loan={loan}
        onDeleteExtra={(id) => setPendingDeleteExtra(id)}
      />

      {/* [ยก Modal เพิ่มโปะ + Modal ลบโปะ จาก LoansPage.tsx:287-361 มาครบ] */}
    </div>
  );
};

export default LoanDetail;
```

> **หมายเหตุสำหรับผู้ทำ:** LoanHero + ThisYearCard + สอง Modal ให้ **copy โค้ดเดิมจาก `LoansPage.tsx` แบบคำต่อคำ** — อย่าเขียนใหม่ เพื่อกัน regression. โครงข้างบนคือ shell; เนื้อในสองการ์ดและสอง Modal เหมือน `LoansPage.tsx:42-187` และ `:287-361` เป๊ะ

- [ ] **Step 2: ต่อ LoanDetail ชั่วคราวใน LoansPage (ยังใช้ loans[0])**

ใน `LoansPage.tsx` — ในสาขาที่มี loan ให้ลบ block hero/thisyear/tables/modals ออกแล้วแทนด้วย `<LoanDetail loan={loan} />` (empty state ยังเดิม). จุดนี้พิสูจน์ว่า extract แล้วหน้ายังทำงานเหมือนเดิมก่อนจะ refactor ต่อ

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ผ่าน ไม่มี error

- [ ] **Step 4: Browser smoke — กยศ ยังแสดงเหมือนเดิม**

Run: `npm run dev` แล้วเปิดหน้า /loans (ถ้าไม่มี loan กด "โหลด กยศ ตัวอย่าง")
Expected: Hero + This-year + ตารางงวด + payment log แสดงเหมือนก่อน refactor, เพิ่ม/ลบโปะ ทำงานได้

- [ ] **Step 5: Commit**

```bash
git add src/components/loans/LoanDetail.tsx src/pages/LoansPage.tsx
git commit -m "refactor(loans): แตก LoanDetail ออกจาก LoansPage (F31)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 4: `LoansPage.tsx` — multi-loan orchestrator

เปลี่ยน page ให้จัดการ list หลายก้อน: pills เลือกก้อน, ปุ่มเพิ่ม/แก้/ลบ, empty state ใหม่

**Files:**
- Modify: `src/pages/LoansPage.tsx`

- [ ] **Step 1: เขียน LoansPage ใหม่ทั้งไฟล์**

```tsx
/**
 * WealthLens — Loans / หนี้สิน manager (F26 + F31 multi-loan).
 *
 * Orchestrates a list of loans: pill selector, add/edit/delete, and an
 * empty state that lets any user create their own debt (no longer pushes
 * Tom's กยศ). Rendering a single loan lives in <LoanDetail>. The store
 * actions (addLoan/updateLoan/deleteLoan) are unchanged.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import LoanDetail from '@/components/loans/LoanDetail';
import LoanForm from '@/components/loans/LoanForm';
import { gslLoan } from '@/data/seedData';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { LoanType } from '@/types';
import { formatTHB } from '@/utils/formatters';
import { getScheduleTotal } from '@/utils/loanCalculations';

const TYPE_LABEL: Record<LoanType, string> = {
  gsl: 'กยศ',
  mortgage: 'สินเชื่อบ้าน',
  auto: 'รถยนต์',
  other: 'อื่นๆ',
};

export const LoansPage = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const seedLoan = useFinanceStore((s) => s.seedLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);
  const pushToast = useToastStore((s) => s.push);

  const loans = data.loans ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(
    loans[0]?.id ?? null,
  );
  // form: null = closed, 'create' = new, {editId} = edit existing
  const [form, setForm] = useState<null | 'create' | { editId: string }>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Keep selection valid as the list changes (add/delete).
  useEffect(() => {
    if (loans.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !loans.some((l) => l.id === selectedId)) {
      setSelectedId(loans[0].id);
    }
  }, [loans, selectedId]);

  const selected = loans.find((l) => l.id === selectedId) ?? null;
  const editingLoan =
    form && form !== 'create'
      ? loans.find((l) => l.id === form.editId) ?? undefined
      : undefined;

  const pendingLoan = pendingDeleteId
    ? loans.find((l) => l.id === pendingDeleteId) ?? null
    : null;

  const handleDelete = (): void => {
    if (!pendingDeleteId) return;
    deleteLoan(pendingDeleteId, { revertExpenseSideEffects: true });
    setPendingDeleteId(null);
    pushToast({ message: 'ลบหนี้แล้ว', tone: 'info' });
  };

  const Header = (): ReactNode => (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">💰 หนี้สิน</h1>
        <p className="text-sm text-slate-500 mt-1">
          ตารางผ่อน + ประวัติชำระ ของหนี้ระยะยาว
        </p>
      </div>
      {loans.length > 0 && (
        <button
          type="button"
          onClick={() => setForm('create')}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition"
        >
          + เพิ่มหนี้
        </button>
      )}
    </div>
  );

  // --- Empty state ---
  if (loans.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center space-y-4">
          <p className="text-sm text-slate-500">ยังไม่มีข้อมูลหนี้</p>
          <button
            type="button"
            onClick={() => setForm('create')}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition"
          >
            + เพิ่มหนี้
          </button>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                seedLoan(gslLoan);
                setSelectedId(gslLoan.id);
                pushToast({ message: 'โหลด กยศ ตัวอย่างแล้ว', tone: 'success' });
              }}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              โหลด กยศ ตัวอย่าง (ของ Tom)
            </button>
          </div>
        </div>

        <Modal
          open={form === 'create'}
          onClose={() => setForm(null)}
          title="เพิ่มหนี้"
          size="lg"
        >
          <div className="px-6 py-5">
            <LoanForm
              onSaved={() => setForm(null)}
              onCancel={() => setForm(null)}
            />
          </div>
        </Modal>
      </div>
    );
  }

  // --- Populated ---
  return (
    <div className="space-y-6">
      <Header />

      {loans.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="เลือกก้อนหนี้">
          {loans.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={l.id === selectedId}
              onClick={() => setSelectedId(l.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                l.id === selectedId
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {l.name}
              <span className="ml-2 text-xs opacity-70">
                {TYPE_LABEL[l.type]}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm({ editId: selected.id })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              แก้ไข
            </button>
            <button
              type="button"
              onClick={() => setPendingDeleteId(selected.id)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-expense hover:bg-red-50"
            >
              ลบ
            </button>
          </div>
          <LoanDetail loan={selected} />
        </>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={form != null}
        onClose={() => setForm(null)}
        title={form === 'create' ? 'เพิ่มหนี้' : 'แก้ไขหนี้'}
        size="lg"
      >
        <div className="px-6 py-5">
          <LoanForm
            initialLoan={editingLoan}
            onSaved={() => setForm(null)}
            onCancel={() => setForm(null)}
          />
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={pendingDeleteId != null}
        onClose={() => setPendingDeleteId(null)}
        title="ลบหนี้ก้อนนี้"
        size="sm"
      >
        {pendingLoan && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-700">
              ลบ{' '}
              <span className="font-semibold">{pendingLoan.name}</span>{' '}
              (คงเหลือตามตาราง{' '}
              <span className="financial-number tabular-nums">
                {formatTHB(getScheduleTotal(pendingLoan), { decimals: 0 })}
              </span>
              ) และประวัติโปะทั้งหมด — พร้อม revert ค่าใช้จ่ายที่ลิงก์ไว้
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-expense px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                ลบหนี้
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LoansPage;
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ผ่าน ไม่มี error

- [ ] **Step 3: Browser smoke — flow เต็ม**

Run: `npm run dev` เปิด /loans แล้วทดสอบตามลำดับ:
1. ล้างข้อมูล (ถ้ามี loan) → เห็น empty state มีปุ่ม "+ เพิ่มหนี้" + link "โหลด กยศ ตัวอย่าง (ของ Tom)" ตัวเล็ก
2. กด "+ เพิ่มหนี้" → กรอกชื่อ "สินเชื่อบ้าน", ประเภท สินเชื่อบ้าน, จำนวนงวด 3, รายเดือน → "สร้างตาราง" → กรอกต้น/ดอก แต่ละแถว → เพิ่มหนี้
3. เห็นก้อนใหม่แสดง Hero + ตารางงวด (ยอดตรงกับที่กรอก)
4. กด "โหลด กยศ ตัวอย่าง" ไม่ได้แล้ว (มี loan แล้ว) — เพิ่มก้อนที่ 2 ผ่าน "+ เพิ่มหนี้" → เห็น pills 2 อัน สลับได้
5. "แก้ไข" ก้อนหนึ่ง → เปลี่ยนยอด → บันทึก → Hero อัปเดต
6. "ลบ" ก้อนหนึ่ง → confirm → หายไป, selection เด้งไปก้อนที่เหลือ

Expected: ทุกขั้นทำงานถูก ไม่มี error ใน console

- [ ] **Step 4: Commit**

```bash
git add src/pages/LoansPage.tsx
git commit -m "feat(loans): multi-loan LoansPage (pills + add/edit/delete + empty state ใหม่) (F31)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Task 5: features.json F31 + final verification

**Files:**
- Modify: `features.json`

- [ ] **Step 1: เพิ่ม F31 ใน `phases[4].features` (Phase 4)**

เพิ่ม entry ต่อท้าย array `features` ของ `phase_4`:

```json
{
  "id": "F31",
  "name": "Multi-loan + User-created Loans (หนี้สินหลายก้อน + เพิ่มเอง)",
  "description": "สร้าง/แก้/ลบ หนี้ได้ทุกประเภท เก็บได้หลายก้อน — รองรับผู้ใช้ที่ไม่มี กยศ โดยไม่ยัดข้อมูลของ Tom",
  "status": "completed",
  "priority": "P1",
  "phase": "phase_4",
  "acceptanceCriteria": [
    "LoanForm สร้าง/แก้ หนี้ทุกประเภท (gsl/mortgage/auto/other) — กรอกตารางงวดเอง ต้น/ดอก แยก",
    "scaffoldSchedule ไล่วันที่ให้ (รายเดือน/รายปี) + clamp สิ้นเดือน, finalizeSchedule คิด totalAmount/principalRatio",
    "LoansPage หลายก้อน: pills เลือกก้อน + ปุ่มเพิ่ม/แก้/ลบ ต่อก้อน",
    "แตก LoanDetail ออกจาก LoansPage (1 component = 1 ก้อน)",
    "Empty state ปุ่มหลัก '+ เพิ่มหนี้', ปุ่มรอง 'โหลด กยศ ตัวอย่าง (ของ Tom)' ตัวเล็ก",
    "ไม่แตะ schema — seed กยศ เดิมของ Tom คำนวณเท่าเดิม (verify-multi-loan.ts)"
  ],
  "estimatedHours": 6,
  "dependencies": ["F26"],
  "checkpoint": {
    "completed": true,
    "completedAt": "2026-07-08",
    "notes": "Spec: docs/superpowers/specs/2026-07-08-multi-loan-user-created-design.md | Plan: docs/superpowers/plans/2026-07-08-multi-loan-user-created.md | Store actions (addLoan/updateLoan/deleteLoan) มีอยู่ก่อนแล้ว — งานนี้ต่อ UI. Verified: scripts/verify-multi-loan.ts + typecheck + build + browser smoke"
  }
}
```

อัปเดต `progressSummary`: `totalFeatures` +1, `completed` +1 (จาก 38 → 39 ทั้งสอง)

- [ ] **Step 2: รัน verify script อีกครั้ง (final)**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts`
Expected: `✅ ALL PASS`

- [ ] **Step 3: typecheck + build (final)**

Run: `npm run typecheck && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 4: Commit**

```bash
git add features.json
git commit -m "docs(features): mark F31 multi-loan completed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014g4xwVjsVrisKn4HG1wasC"
```

---

## Definition of Done

- [ ] `scripts/verify-multi-loan.ts` → `✅ ALL PASS` (helper ถูก + seed กยศ self-consistent)
- [ ] `npm run typecheck` ผ่าน (ไม่มี `any`/`unknown` เกินจำเป็น ตาม CLAUDE.md)
- [ ] `npm run build` ผ่าน
- [ ] Browser: empty → เพิ่ม → หลายก้อน (pills) → แก้ → ลบ ครบ flow
- [ ] กยศ เดิมของ Tom แสดง/คำนวณเหมือนก่อน refactor
- [ ] features.json F31 = completed
