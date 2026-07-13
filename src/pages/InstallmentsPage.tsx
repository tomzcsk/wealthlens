/**
 * WealthLens — Installment Manager.
 *
 * One screen to see every ผ่อน plan Tom has ever started: how much he's
 * paid, what's left, when each งวด lands, and an escape hatch to nuke a
 * whole plan. The page reads from `selectInstallmentPlans`, which joins
 * every ExpenseItem tagged with an `installment.planId` across years —
 * cross-year plans (e.g. start พ.ย. 2026, end ก.ย. 2027) show up here as
 * a single coherent timeline even though the underlying rows live in two
 * separate `YearData` entries.
 *
 * Active vs Completed:
 *   - "Active" = at least one งวด is in the future (relative to today).
 *   - "Completed" = every งวด is in the past. Collapsed by default so
 *     finished plans don't crowd out current obligations.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import {
  selectInstallmentPlans,
  type InstallmentPlanSummary,
} from '@/stores/selectors';
import { useToastStore } from '@/stores/toastStore';
import { Modal } from '@/components/ui/Modal';
import InstallmentForm from '@/components/forms/InstallmentForm';
import { EXPENSE_CATEGORIES } from '@/types/expense-categories';
import {
  formatTHB,
  THAI_MONTHS_SHORT,
} from '@/utils/formatters';

const todayYearMonth = (): { year: number; month: number } => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

const formatThaiMonthYearShort = (year: number, month: number): string =>
  `${THAI_MONTHS_SHORT[month - 1]} ${year}`;

interface PlanCardProps {
  plan: InstallmentPlanSummary;
  onDelete: (plan: InstallmentPlanSummary) => void;
}

const PlanCard = ({ plan, onDelete }: PlanCardProps): ReactNode => {
  const [expanded, setExpanded] = useState(false);
  const meta = EXPENSE_CATEGORIES[plan.category];
  const progressPct =
    plan.totalAmount > 0
      ? Math.min(100, Math.round((plan.paidAmount / plan.totalAmount) * 100))
      : 0;
  return (
    <div className="bg-card border border-ink-200 rounded-2xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span aria-hidden="true">{meta.icon}</span>
            <h3 className="text-base font-semibold text-ink-900 truncate">
              {plan.name}
            </h3>
            {plan.isCompleted && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-income-800 bg-income-50 border border-income-200 rounded-full">
                ผ่อนครบแล้ว
              </span>
            )}
          </div>
          <p className="text-xs text-ink-500 mt-1">
            {meta.label} · เริ่ม{' '}
            {formatThaiMonthYearShort(plan.startYear, plan.startMonth)} → จบ{' '}
            {formatThaiMonthYearShort(plan.endYear, plan.endMonth)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(plan)}
          className="text-xs text-ink-400 hover:text-expense-ink transition shrink-0"
          aria-label={`ลบแผน ${plan.name}`}
        >
          🗑️ ลบทั้งแผน
        </button>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-baseline justify-between text-xs text-ink-500 mb-1">
          <span>
            ผ่อนไป {plan.paidMonths}/{plan.totalMonths} งวด
          </span>
          <span className="financial-number tabular-nums">
            {formatTHB(plan.paidAmount)} / {formatTHB(plan.totalAmount)}
          </span>
        </div>
        <div className="h-2 bg-raised rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              plan.isCompleted ? 'bg-income-fill' : 'bg-primary'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-ink-500">คงเหลือ</div>
            <div className="font-semibold text-ink-900 financial-number tabular-nums">
              {formatTHB(plan.remainingAmount)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-ink-500">งวดถัดไป</div>
            <div className="font-semibold text-ink-900">
              {plan.nextDue ? (
                <>
                  {formatThaiMonthYearShort(
                    plan.nextDue.year,
                    plan.nextDue.month,
                  )}{' '}
                  ·{' '}
                  <span className="financial-number tabular-nums">
                    {formatTHB(plan.nextDue.amount)}
                  </span>
                </>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable timeline */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary-ink hover:text-primary-700"
        >
          {expanded ? '▾ ซ่อน timeline' : `▸ ดู timeline (${plan.schedule.length} งวด)`}
        </button>
        {expanded && (
          <ol className="mt-3 space-y-1 max-h-64 overflow-y-auto pr-1">
            {plan.schedule.map((inst) => {
              const today = todayYearMonth();
              const isFuture =
                inst.year * 100 + inst.month > today.year * 100 + today.month;
              const faded = isFuture || !inst.materialized;
              return (
                <li
                  key={inst.sequence}
                  className={`flex items-center justify-between text-xs px-3 py-1.5 rounded ${
                    faded ? 'bg-card text-ink-400' : 'bg-surface text-ink-600'
                  }`}
                >
                  <span>
                    งวด {inst.sequence}/{plan.totalMonths} ·{' '}
                    {formatThaiMonthYearShort(inst.year, inst.month)}
                    {!inst.materialized && (
                      <span className="ml-2 inline-block px-1 text-[10px] text-ink-500 bg-raised rounded">
                        คาดการณ์
                      </span>
                    )}
                  </span>
                  <span className="financial-number tabular-nums">
                    {formatTHB(inst.amount)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};

export const InstallmentsPage = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const selectedYear = useFinanceStore((s) => s.selectedYear);
  const deleteInstallmentPlan = useFinanceStore(
    (s) => s.deleteInstallmentPlan,
  );
  const untagInstallmentPlan = useFinanceStore(
    (s) => s.untagInstallmentPlan,
  );
  const pushToast = useToastStore((s) => s.push);

  const snapshot = useMemo(() => ({ data }), [data]);
  const plans = useMemo(() => selectInstallmentPlans(snapshot), [snapshot]);

  const activePlans = useMemo(
    () => plans.filter((p) => !p.isCompleted),
    [plans],
  );
  const completedPlans = useMemo(
    () => plans.filter((p) => p.isCompleted),
    [plans],
  );

  const [showCompleted, setShowCompleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<InstallmentPlanSummary | null>(null);

  // KPI strip — summed across active plans only.
  const kpis = useMemo(() => {
    const today = todayYearMonth();
    const todayKey = today.year * 100 + today.month;
    let thisMonthDue = 0;
    let totalRemaining = 0;
    for (const plan of activePlans) {
      totalRemaining += plan.remainingAmount;
      for (const inst of plan.schedule) {
        if (inst.year * 100 + inst.month === todayKey) {
          thisMonthDue += inst.amount;
        }
      }
    }
    return {
      activeCount: activePlans.length,
      thisMonthDue,
      totalRemaining,
    };
  }, [activePlans]);

  const confirmDelete = (): void => {
    const plan = pendingDelete;
    if (!plan) return;
    deleteInstallmentPlan(plan.planId);
    setPendingDelete(null);
    pushToast({
      message: `ลบแผน '${plan.name}' (${plan.totalMonths} งวด) แล้ว`,
      tone: 'info',
    });
  };

  const confirmUntag = (): void => {
    const plan = pendingDelete;
    if (!plan) return;
    untagInstallmentPlan(plan.planId);
    setPendingDelete(null);
    pushToast({
      message: `ยกเลิกสถานะผ่อนของ '${plan.name}' แล้ว (เก็บรายการไว้)`,
      tone: 'info',
    });
  };

  const today = todayYearMonth();

  return (
    <div className="space-y-6">
      {/* ชื่อหน้า/แท็บเป็นของ DebtPage แล้ว — เหลือแค่คำบรรยาย + ปุ่มสร้างแผนผ่อน */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          ทุกแผนผ่อน 0% หรือผ่อนหลายงวดที่กำลังทยอยจ่ายอยู่
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
        >
          + สร้างแผนผ่อน
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi
          label="แผน Active"
          value={`${kpis.activeCount} แผน`}
          tone="default"
        />
        <Kpi
          label="ยอดผ่อนเดือนนี้"
          value={formatTHB(kpis.thisMonthDue)}
          tone="expense"
        />
        <Kpi
          label="ยอดคงเหลือทั้งหมด"
          value={formatTHB(kpis.totalRemaining)}
          tone="net"
        />
      </div>

      {/* Active plans */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">กำลังผ่อนอยู่</h2>
        {activePlans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 bg-card p-8 text-center">
            <p className="text-sm text-ink-500 mb-4">
              ยังไม่มีแผนผ่อนที่ active
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
            >
              + สร้างแผนผ่อน
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePlans.map((plan) => (
              <PlanCard
                key={plan.planId}
                plan={plan}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Completed plans (collapsed by default) */}
      {completedPlans.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="text-sm text-ink-600 hover:text-ink-900"
          >
            {showCompleted ? '▾' : '▸'} ผ่อนครบแล้ว ({completedPlans.length})
          </button>
          {showCompleted && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedPlans.map((plan) => (
                <PlanCard
                  key={plan.planId}
                  plan={plan}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Create plan modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="สร้างแผนผ่อน"
        size="md"
      >
        <div className="px-6 py-5">
          <InstallmentForm
            defaultYear={selectedYear || today.year}
            defaultMonth={today.month}
            onSaved={() => {
              setCreateOpen(false);
              pushToast({ message: 'สร้างแผนผ่อนแล้ว ✓', tone: 'success' });
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </Modal>

      {/* Confirm delete plan */}
      <Modal
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="ลบแผนผ่อน"
        size="sm"
      >
        {pendingDelete && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-ink-700">
              ลบแผน{' '}
              <span className="font-semibold">{pendingDelete.name}</span>{' '}
              ({pendingDelete.totalMonths} งวด รวม{' '}
              {formatTHB(pendingDelete.totalAmount)})?
            </p>
            <p className="text-xs text-ink-500">
              เลือก "ยกเลิกสถานะผ่อน" ถ้าแค่อยากเอา badge ออกแต่เก็บรายการรายจ่ายไว้
              (เช่น รถยนต์) — หรือ "ลบทุกงวด" ถ้าต้องการลบรายการออกจริง (เช่น
              แผนซื้อของผ่อน) · ลบทุกงวด undo ไม่ได้
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={confirmUntag}
                className="w-full px-4 py-2 text-sm font-medium text-ink-700 bg-card border border-ink-300 rounded-md hover:bg-hover transition"
              >
                ยกเลิกสถานะผ่อน (เก็บรายการไว้)
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-expense rounded-md hover:bg-expense-dark transition"
              >
                ลบทุกงวด ({pendingDelete.totalMonths} งวด รวม{' '}
                {pendingDelete.instances.length} แถว)
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="w-full px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-700 transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

type KpiTone = 'default' | 'expense' | 'net';

const KPI_TONE: Record<KpiTone, string> = {
  default: 'text-ink-900',
  expense: 'text-expense-ink',
  net: 'text-net-ink',
};

const Kpi = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: KpiTone;
}): ReactNode => (
  <div className="bg-card border border-ink-200 rounded-2xl shadow-sm p-4">
    <div className="text-xs text-ink-500 uppercase tracking-wider">
      {label}
    </div>
    <div
      className={`mt-1 text-xl font-bold financial-number tabular-nums ${KPI_TONE[tone]}`}
    >
      {value}
    </div>
  </div>
);

export default InstallmentsPage;
