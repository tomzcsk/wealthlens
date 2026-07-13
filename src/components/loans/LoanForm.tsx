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
import { v4 as uuidv4 } from 'uuid';

import AmortizationBuilder from '@/components/loans/AmortizationBuilder';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { Loan, LoanType } from '@/types';
import { formatNumber } from '@/utils/formatters';
import {
  finalizeSchedule,
  scaffoldSchedule,
  type LoanScheduleDraftRow,
  type ScheduleFrequency,
} from '@/utils/loanForm';

/** จำนวนแถวที่ render ก่อนกด "แสดงทั้งหมด" — ตารางลดต้นลดดอกยาวได้ถึง 123 งวด. */
const ROWS_PREVIEW_LIMIT = 5;

interface LoanFormProps {
  /** undefined = create; a Loan = edit that loan. */
  initialLoan?: Loan;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Form-local editable row. Amounts are stored as raw TEXT so a mid-typed
 * value like "1500." or "1500.50" is preserved verbatim (a number
 * round-trip would drop the trailing dot). `id` is stable across edits so
 * removing a row never disturbs sibling inputs' identity/focus.
 */
interface EditRow {
  id: string;
  dueDate: string;
  principalText: string;
  interestText: string;
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
  const [rows, setRows] = useState<EditRow[]>(
    initialLoan
      ? initialLoan.schedule.map((i) => ({
          id: uuidv4(),
          dueDate: i.dueDate,
          principalText: String(i.principalAmount),
          interestText: String(i.interestAmount),
        }))
      : [],
  );
  const [error, setError] = useState<string | null>(null);
  // โหมดคำนวณเปิดได้เฉพาะตอนสร้างหนี้ใหม่ (แก้ไข = กรอกมือ/สร้างตารางใหม่ทับ).
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [showAllRows, setShowAllRows] = useState(false);
  const [assumeOnSchedule, setAssumeOnSchedule] = useState(
    initialLoan?.assumeOnSchedule ?? false,
  );

  const applyGeneratedSchedule = (
    generated: LoanScheduleDraftRow[],
  ): void => {
    setRows(
      generated.map((r) => ({
        id: uuidv4(),
        dueDate: r.dueDate,
        principalText: String(r.principalAmount),
        interestText: String(r.interestAmount),
      })),
    );
    setShowAllRows(false);
    setError(null);
  };

  const regenerate = (): void => {
    const c = Math.max(0, Math.floor(Number(count) || 0));
    if (c < 1) {
      setError('จำนวนงวดต้องอย่างน้อย 1');
      return;
    }
    setRows(
      scaffoldSchedule(startDate, c, frequency).map((r) => ({
        id: uuidv4(),
        dueDate: r.dueDate,
        principalText: '',
        interestText: '',
      })),
    );
    setShowAllRows(false);
    setError(null);
  };

  const patchRow = (
    id: string,
    field: 'dueDate' | 'principalText' | 'interestText',
    value: string,
  ): void => {
    const v = field === 'dueDate' ? value : value.replace(/[^\d.]/g, '');
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: v } : r)),
    );
  };

  const removeRow = (id: string): void => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const rowTotal = (r: EditRow): number =>
    (Number(r.principalText) || 0) + (Number(r.interestText) || 0);
  const scheduleTotal = rows.reduce((a, r) => a + rowTotal(r), 0);

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
    if (scheduleTotal <= 0) {
      setError('กรอกยอด (ต้น/ดอก) อย่างน้อย 1 งวด');
      return;
    }
    const draft = rows.map((r, idx) => ({
      installmentNumber: idx + 1,
      dueDate: r.dueDate,
      principalAmount: Number(r.principalText) || 0,
      interestAmount: Number(r.interestText) || 0,
    }));
    const schedule = finalizeSchedule(draft);

    if (isEdit && initialLoan) {
      updateLoan(initialLoan.id, {
        name: name.trim(),
        type,
        startDate,
        schedule,
        assumeOnSchedule,
      });
      pushToast({ message: 'แก้ไขหนี้แล้ว', tone: 'success' });
    } else {
      addLoan({
        name: name.trim(),
        type,
        startDate,
        schedule,
        assumeOnSchedule,
      });
      pushToast({ message: 'เพิ่มหนี้แล้ว', tone: 'success' });
    }
    onSaved();
  };

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary-ink/30';
  const cellCls =
    'w-full rounded border border-ink-300 px-2 py-1 text-sm financial-number tabular-nums text-right focus:border-primary-ink focus:outline-none focus:ring-1 focus:ring-primary-ink/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm font-medium text-ink-700">
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
        <label className="block text-sm font-medium text-ink-700">
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

      {!isEdit && (
        <div className="flex gap-4 text-sm">
          {(
            [
              ['manual', 'กรอกตารางเอง'],
              ['auto', 'คำนวณอัตโนมัติ (ลดต้นลดดอก)'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 text-ink-700"
            >
              <input
                type="radio"
                name="schedule-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {mode === 'auto' && !isEdit ? (
        <AmortizationBuilder
          startDate={startDate}
          onStartDateChange={setStartDate}
          onGenerate={applyGeneratedSchedule}
          inputCls={inputCls}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <label className="block text-sm font-medium text-ink-700">
              วันเริ่มงวดแรก
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-medium text-ink-700">
              จำนวนงวด
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-medium text-ink-700">
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
            className="rounded-lg border border-primary-ink px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-50 transition"
          >
            {rows.length > 0 ? 'สร้างตารางใหม่' : 'สร้างตาราง'}
          </button>
        </>
      )}

      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={assumeOnSchedule}
          onChange={(e) => setAssumeOnSchedule(e.target.checked)}
          className="mt-1"
        />
        <span>
          ถือว่าจ่ายตามงวดอัตโนมัติ
          <span className="block text-xs text-ink-500">
            ยอดคงเหลือลดตามงวดที่ถึงกำหนด โดยไม่ต้องบันทึกอะไร ·
            ถ้าผูกรายจ่ายรายเดือนกับหนี้ก้อนนี้แล้ว ไม่ต้องติ๊ก (รายจ่ายจริงมาก่อนเสมอ)
          </span>
        </span>
      </label>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs text-ink-500">
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
              {(showAllRows ? rows : rows.slice(0, ROWS_PREVIEW_LIMIT)).map(
                (r, idx) => (
                <tr key={r.id} className="border-t border-ink-100">
                  <td className="px-2 py-1 tabular-nums text-ink-500">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="date"
                      value={r.dueDate}
                      onChange={(e) =>
                        patchRow(r.id, 'dueDate', e.target.value)
                      }
                      className="rounded border border-ink-300 px-2 py-1 text-sm focus:border-primary-ink focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.principalText}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        patchRow(r.id, 'principalText', e.target.value)
                      }
                      className={cellCls}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.interestText}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        patchRow(r.id, 'interestText', e.target.value)
                      }
                      className={cellCls}
                    />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-ink-700">
                    {formatNumber(rowTotal(r), { decimals: 0 })}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      aria-label={`ลบงวด ${idx + 1}`}
                      className="text-ink-400 hover:text-expense-ink"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface text-sm font-semibold">
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
          {rows.length > ROWS_PREVIEW_LIMIT && !showAllRows && (
            <button
              type="button"
              onClick={() => setShowAllRows(true)}
              className="w-full rounded-lg border border-ink-200 py-2 text-sm text-primary-ink hover:bg-hover transition"
            >
              แสดงทั้งหมด ({rows.length} งวด)
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-expense-50 border border-expense-200 px-3 py-2 text-sm text-expense-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-hover"
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
