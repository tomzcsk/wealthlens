/**
 * WealthLens — auto amortization builder (F36).
 *
 * โหมด "คำนวณอัตโนมัติ (ลดต้นลดดอก)" ของ LoanForm: ผู้ใช้กรอกแค่ (วันงวดแรก,
 * ยอดคงเหลือ, ดอกเบี้ย %/ปี, จ่าย/เดือน) → preview สด → กด "สร้างตาราง" แล้ว
 * ส่ง draft rows กลับให้ LoanForm เติมลง EditRow state ต่อ. Component นี้ถือ
 * state ของ 3 ช่องตัวเลขเอง (ยอด/ดอก/จ่าย) แต่ startDate เป็นของ LoanForm
 * เพราะโหมดกรอกมือใช้ค่าเดียวกัน.
 */
import { useState, type ReactNode } from 'react';

import {
  generateAmortizationSchedule,
  type AmortizationError,
} from '@/utils/amortization';
import type { LoanScheduleDraftRow } from '@/utils/loanForm';
import { formatNumber } from '@/utils/formatters';

const AUTO_ERROR_TEXT: Record<AmortizationError, string> = {
  INVALID_INPUT: 'กรอกยอดคงเหลือ ดอกเบี้ย ค่างวด และวันงวดแรกให้ครบ',
  PAYMENT_TOO_LOW:
    'ค่างวดน้อยกว่าดอกเบี้ยงวดแรก — ผ่อนไม่มีวันหมด ลองเพิ่มค่างวด',
  TOO_MANY_PERIODS: 'ตารางยาวเกิน 600 งวด (50 ปี) — ตรวจค่างวดอีกครั้ง',
};

interface AmortizationBuilderProps {
  startDate: string;
  onStartDateChange: (value: string) => void;
  onGenerate: (rows: LoanScheduleDraftRow[]) => void;
  inputCls: string;
}

export const AmortizationBuilder = ({
  startDate,
  onStartDateChange,
  onGenerate,
  inputCls,
}: AmortizationBuilderProps): ReactNode => {
  const [openingText, setOpeningText] = useState('');
  const [rateText, setRateText] = useState('');
  const [paymentText, setPaymentText] = useState('');

  const preview = generateAmortizationSchedule({
    openingBalance: Number(openingText) || 0,
    annualRatePercent: Number(rateText) || 0,
    monthlyPayment: Number(paymentText) || 0,
    firstDueDate: startDate,
  });

  const stripNonNumeric = (value: string): string =>
    value.replace(/[^\d.]/g, '');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <label className="block text-sm font-medium text-ink-700">
          วันงวดแรก
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-ink-700">
          ยอดคงเหลือ (บาท)
          <input
            type="text"
            inputMode="decimal"
            value={openingText}
            onChange={(e) => setOpeningText(stripNonNumeric(e.target.value))}
            placeholder="3047222.30"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-ink-700">
          ดอกเบี้ย (%/ปี)
          <input
            type="text"
            inputMode="decimal"
            value={rateText}
            onChange={(e) => setRateText(stripNonNumeric(e.target.value))}
            placeholder="3.75"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-ink-700">
          จ่ายต่อเดือน (บาท)
          <input
            type="text"
            inputMode="decimal"
            value={paymentText}
            onChange={(e) => setPaymentText(stripNonNumeric(e.target.value))}
            placeholder="30000"
            className={inputCls}
          />
        </label>
      </div>

      {preview.ok && (
        <div className="rounded-lg bg-surface border border-ink-200 px-3 py-2 text-sm text-ink-700">
          <span className="font-semibold tabular-nums">
            {preview.rows.length} งวด
          </span>{' '}
          · จบ {preview.rows[preview.rows.length - 1].dueDate} · ดอกรวม{' '}
          <span className="financial-number tabular-nums">
            {formatNumber(preview.totalInterest, { decimals: 0 })}
          </span>{' '}
          · จ่ายรวม{' '}
          <span className="financial-number tabular-nums">
            {formatNumber(preview.totalPaid, { decimals: 0 })}
          </span>
        </div>
      )}
      {!preview.ok && (openingText !== '' || paymentText !== '') && (
        <div className="rounded-md bg-warning-50 border border-warning-200 px-3 py-2 text-sm text-warning-800">
          {AUTO_ERROR_TEXT[preview.error]}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (preview.ok) onGenerate(preview.rows);
        }}
        disabled={!preview.ok}
        className="rounded-lg border border-primary-ink px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-50 transition disabled:opacity-40"
      >
        สร้างตาราง
      </button>
    </div>
  );
};

export default AmortizationBuilder;
