/**
 * WealthLens — สรุปยอดฝากเข้าบัญชีก่อนบันทึกรายได้ (F39).
 *
 * เงินจะถูกเขียนลงยอดบัญชีจริง ผู้ใช้จึงต้องเห็นก่อนว่าอะไรเข้าที่ไหนเท่าไหร่
 * — โดยเฉพาะเงินเดือนที่ฝาก "หลังหัก" ซึ่งไม่ตรงกับตัวเลขที่เพิ่งพิมพ์ไป.
 */
import type { ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import type { BankAccount, IncomeDepositRef } from '@/types';
import { formatTHB } from '@/utils/formatters';

const SOURCE_LABEL: Record<IncomeDepositRef['source'], string> = {
  salary: 'เงินเดือน (หลังหัก)',
  bonus: 'โบนัส',
  commission: 'คอมมิชชั่น',
  otherIncome: 'รายได้อื่นๆ',
};

export interface IncomeDepositSummaryProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  refs: ReadonlyArray<IncomeDepositRef>;
  /** ยอดที่เคยฝากไว้ (โหมดแก้ไข) — ใช้โชว์ส่วนต่าง. */
  previousRefs?: ReadonlyArray<IncomeDepositRef>;
  accounts: ReadonlyArray<BankAccount>;
  /** true → เตือนว่ายอดหักมากกว่าเงินเดือน (จะฝาก ฿0). */
  salaryUnderwater: boolean;
  monthLabel: string;
}

const sumRefs = (refs: ReadonlyArray<IncomeDepositRef>): number =>
  refs.reduce((acc, r) => acc + r.amount, 0);

export const IncomeDepositSummary = ({
  open,
  onClose,
  onConfirm,
  refs,
  previousRefs,
  accounts,
  salaryUnderwater,
  monthLabel,
}: IncomeDepositSummaryProps): ReactNode => {
  const total = sumRefs(refs);
  const previousTotal = previousRefs ? sumRefs(previousRefs) : null;
  const nameOf = (accountId: string): string =>
    accounts.find((a) => a.id === accountId)?.name ?? 'บัญชีที่ถูกลบ';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ยืนยันการฝากเข้าบัญชี"
      size="sm"
    >
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm text-slate-600">
          จะบันทึกรายได้เดือน {monthLabel} และฝากเงินเข้าบัญชี:
        </p>

        {salaryUnderwater && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            ยอดหักมากกว่าเงินเดือน — จะฝาก ฿0
          </div>
        )}

        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          {refs.map((ref) => (
            <div
              key={ref.source}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="text-slate-700">{SOURCE_LABEL[ref.source]}</div>
                <div className="text-xs text-slate-400 truncate">
                  → {nameOf(ref.accountId)}
                </div>
              </div>
              <div className="text-income font-semibold tabular-nums whitespace-nowrap">
                +{formatTHB(ref.amount, { decimals: 0 })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-slate-50">
            <div className="font-medium text-slate-700">รวมเข้าบัญชี</div>
            <div className="font-bold text-slate-900 tabular-nums whitespace-nowrap">
              {formatTHB(total, { decimals: 0 })}
            </div>
          </div>
        </div>

        {previousTotal !== null && (
          <p className="text-xs text-slate-500 tabular-nums">
            ยอดฝากเดิม {formatTHB(previousTotal, { decimals: 0 })} → ใหม่{' '}
            {formatTHB(total, { decimals: 0 })}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            ยืนยันบันทึก
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default IncomeDepositSummary;
