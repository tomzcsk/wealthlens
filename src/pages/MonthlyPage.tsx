import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useFinanceStore } from '@/stores';
import { useGoalsStore } from '@/stores/goalsStore';
import { selectMonthIncome, selectMonthSummary } from '@/stores/selectors';
import { IncomeForm } from '@/components/forms/IncomeForm';
import { ExpenseList } from '@/components/forms/ExpenseList';
import { SavingsList } from '@/components/forms/SavingsList';
import { Modal } from '@/components/ui/Modal';
import {
  formatNumber,
  formatTHB,
  formatThaiMonthYear,
  THAI_MONTHS_LONG,
} from '@/utils/formatters';

const clampMonth = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(12, Math.max(1, Math.trunc(value)));
};

const fallbackMonth = (): number => {
  const today = new Date();
  return today.getMonth() + 1;
};

export const MonthlyPage = (): ReactNode => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const year = useFinanceStore((s) => s.selectedYear);
  const data = useFinanceStore((s) => s.data);

  // Derive `month` directly from the URL — the URL is the source of truth.
  // Avoids the previous useState/useEffect sync pair (which tripped
  // react-hooks/set-state-in-effect because the effect mirrored search
  // params into local state).
  const month = clampMonth(
    Number(searchParams.get('month')) || fallbackMonth(),
  );
  const [editingIncome, setEditingIncome] = useState(false);

  const goMonth = (next: number) => {
    const clamped = clampMonth(next);
    setSearchParams({ month: String(clamped) }, { replace: true });
  };

  const snapshot = useMemo(() => ({ data }), [data]);
  const income = useMemo(
    () => selectMonthIncome(snapshot, year, month),
    [snapshot, year, month],
  );
  const summary = useMemo(
    () => selectMonthSummary(snapshot, year, month),
    [snapshot, year, month],
  );

  const monthName = formatThaiMonthYear(month, year);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goMonth(month - 1)}
            disabled={month <= 1}
            className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            aria-label="เดือนก่อนหน้า"
          >
            ← {month > 1 ? THAI_MONTHS_LONG[month - 2] : ''}
          </button>
          <h1 className="text-2xl font-bold text-slate-900 min-w-[12rem] text-center">
            {monthName}
          </h1>
          <button
            type="button"
            onClick={() => goMonth(month + 1)}
            disabled={month >= 12}
            className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            aria-label="เดือนถัดไป"
          >
            {month < 12 ? THAI_MONTHS_LONG[month] : ''} →
          </button>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← กลับภาพรวม
        </button>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">รายได้</h2>
          <button
            type="button"
            onClick={() => setEditingIncome(true)}
            className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark"
          >
            {income ? 'แก้ไขรายได้' : '+ เพิ่มรายได้'}
          </button>
        </header>

        {income ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="เงินเดือน" amount={income.salary} />
            <Stat label="โบนัส" amount={income.bonus} />
            <Stat label="คอม" amount={income.commission} tone="income" />
            <Stat label="ภาษี" amount={income.deductions.tax} tone="muted" />
            <Stat
              label="ประกันสังคม"
              amount={income.deductions.socialSecurity}
              tone="muted"
            />
            <Stat
              label="กองทุนสำรองเลี้ยงชีพ"
              amount={income.deductions.providentFund}
              tone="muted"
            />
            <Stat label="กยศ" amount={income.deductions.gsl} tone="muted" />
            <Stat
              label="รวมหัก"
              amount={summary.totalDeductions}
              tone="expense"
            />
            <Stat label="Net." amount={summary.netSalary} tone="net" />
            <Stat
              label="Net. All"
              amount={summary.netAll}
              tone="net"
              emphasize
            />
          </div>
        ) : (
          <p className="text-slate-500 text-sm py-8 text-center">
            ยังไม่มีข้อมูลรายได้สำหรับเดือนนี้ — กด "เพิ่มรายได้" เพื่อเพิ่ม
          </p>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">ออม / ลงทุน</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              เงินที่กันไว้สะสม — ไม่ใช่ค่าใช้จ่าย
            </p>
          </div>
        </header>

        <KeptYearRow year={year} />

        <SavingsList year={year} month={month} />
      </section>

      <ExpenseList year={year} month={month} />

      <section className="bg-slate-900 text-white rounded-2xl shadow-sm p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStat label="Net. All" amount={summary.netAll} tone="net" />
          <SummaryStat
            label="จ่าย"
            amount={summary.totalExpenses}
            tone="expense"
          />
          <SummaryStat
            label="ออม / ลงทุน"
            amount={summary.totalSavings}
            tone="income"
          />
          <SummaryStat
            label="เหลือจริง"
            amount={summary.remaining}
            tone={summary.remaining >= 0 ? 'income' : 'expense'}
          />
        </div>
      </section>

      <Modal
        open={editingIncome}
        onClose={() => setEditingIncome(false)}
        title={`รายได้ — ${monthName}`}
        size="lg"
      >
        <IncomeForm
          year={year}
          month={month}
          initialValues={income}
          onSaved={() => setEditingIncome(false)}
          onCancel={() => setEditingIncome(false)}
          onDelete={() => setEditingIncome(false)}
        />
      </Modal>
    </div>
  );
};

type StatTone = 'default' | 'muted' | 'income' | 'expense' | 'net';

const TONE_CLASS: Record<StatTone, string> = {
  default: 'text-slate-900',
  muted: 'text-slate-500',
  income: 'text-income',
  expense: 'text-expense',
  net: 'text-net',
};

const Stat = ({
  label,
  amount,
  tone = 'default',
  emphasize = false,
}: {
  label: string;
  amount: number;
  tone?: StatTone;
  emphasize?: boolean;
}): ReactNode => (
  <div className="space-y-1">
    <div className="text-xs text-slate-500 uppercase tracking-wider">
      {label}
    </div>
    <div
      className={`tabular-nums ${TONE_CLASS[tone]} ${
        emphasize ? 'text-2xl font-bold' : 'text-base font-semibold'
      }`}
    >
      {formatTHB(amount)}
    </div>
  </div>
);

const SUMMARY_TONE_CLASS: Record<'income' | 'expense' | 'net', string> = {
  income: 'text-emerald-300',
  expense: 'text-red-300',
  net: 'text-violet-300',
};

const SummaryStat = ({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: 'income' | 'expense' | 'net';
}): ReactNode => (
  <div className="space-y-1 text-center">
    <div className="text-xs uppercase tracking-wider text-slate-300">
      {label}
    </div>
    <div
      className={`text-2xl font-bold tabular-nums ${SUMMARY_TONE_CLASS[tone]}`}
    >
      {formatTHB(amount)}
    </div>
  </div>
);

/**
 * Inline editable Kept (Krungsri) balance for the active year.
 * Yearly snapshot — same value across all 12 months. Click to edit.
 */
const KeptYearRow = ({ year }: { year: number }): ReactNode => {
  const kept = useGoalsStore((s) => s.keptBalances[String(year)] ?? 0);
  const setKeptBalance = useGoalsStore((s) => s.setKeptBalance);
  const clearKeptBalance = useGoalsStore((s) => s.clearKeptBalance);

  const handleEdit = (): void => {
    const raw = window.prompt(
      `ใส่ยอดบัญชี Kept (กรุงศรี) สำหรับปี ${year} — เว้นว่างเพื่อลบ`,
      kept > 0 ? formatNumber(kept) : '',
    );
    if (raw === null) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      clearKeptBalance(year);
      return;
    }
    const parsed = Number(trimmed.replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed >= 0) {
      setKeptBalance(year, parsed);
    }
  };

  return (
    <button
      type="button"
      onClick={handleEdit}
      className="w-full flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors text-left"
      title="ยอดรายปี — คลิกเพื่อแก้"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-xl">
          💼
        </span>
        <div>
          <div className="text-sm font-semibold text-amber-900">
            Kept (กรุงศรี)
          </div>
          <div className="text-xs text-amber-700/80">
            ยอดรายปี — ปลายปี {year}
          </div>
        </div>
      </div>
      <div
        className={`tabular-nums text-base font-bold ${
          kept > 0 ? 'text-amber-900' : 'text-amber-400'
        }`}
      >
        {kept > 0 ? formatTHB(kept) : '+ ใส่ยอด'}
      </div>
    </button>
  );
};

export default MonthlyPage;
