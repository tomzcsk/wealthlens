/**
 * WealthLens — สร้างตารางผ่อนแบบลดต้นลดดอก (F36).
 *
 * ธนาคารบางแห่งไม่ส่งตารางงวดมาให้ ผู้ใช้รู้แค่ (ยอดคงเหลือ, อัตราดอกเบี้ย,
 * ค่างวด). ฟังก์ชันนี้ไล่ดอกเบี้ยรายเดือนแบบ balance × rate/12 (ตรงกับชีต
 * ของ Tom: 3,047,222.30 × 3.75% ÷ 12 = 9,522.57) แล้วคืน draft rows ที่
 * `finalizeSchedule()` ใน utils/loanForm รับต่อได้ทันที — ไม่มีเส้นทาง
 * บันทึกใหม่.
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now (วันที่ไล่จาก firstDueDate).
 * ข้อผิดพลาดคืนเป็น discriminated union ไม่ใช่ exception.
 */
import { stepDate, type LoanScheduleDraftRow } from '@/utils/loanForm';

/** เพดานกันลูปไม่รู้จบ: 600 งวด = 50 ปี */
export const MAX_PERIODS = 600;

export interface AmortizationInput {
  /** เงินต้นคงเหลือวันนี้ (บาท) */
  openingBalance: number;
  /** อัตราดอกเบี้ยต่อปีเป็นเปอร์เซ็นต์ — 3.75 = 3.75%/ปี */
  annualRatePercent: number;
  /** ค่างวดคงที่ต่อเดือน (บาท) */
  monthlyPayment: number;
  /** ISO yyyy-mm-dd ของงวดแรก */
  firstDueDate: string;
}

export type AmortizationError =
  | 'INVALID_INPUT'
  | 'PAYMENT_TOO_LOW'
  | 'TOO_MANY_PERIODS';

export type AmortizationResult =
  | {
      ok: true;
      rows: LoanScheduleDraftRow[];
      /** ผลรวมดอกเบี้ยทั้งสัญญา */
      totalInterest: number;
      /** openingBalance + totalInterest */
      totalPaid: number;
    }
  | { ok: false; error: AmortizationError };

const round2 = (n: number): number => Math.round(n * 100) / 100;

const isValidIso = (iso: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
  Number.isFinite(new Date(`${iso}T00:00:00`).getTime());

export const generateAmortizationSchedule = (
  input: AmortizationInput,
): AmortizationResult => {
  const { openingBalance, annualRatePercent, monthlyPayment, firstDueDate } =
    input;

  if (
    !Number.isFinite(openingBalance) ||
    openingBalance <= 0 ||
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent < 0 ||
    !Number.isFinite(monthlyPayment) ||
    monthlyPayment <= 0 ||
    !isValidIso(firstDueDate)
  ) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const monthlyRate = annualRatePercent / 100 / 12;
  const firstInterest = round2(openingBalance * monthlyRate);
  if (monthlyPayment <= firstInterest) {
    return { ok: false, error: 'PAYMENT_TOO_LOW' };
  }

  const rows: LoanScheduleDraftRow[] = [];
  let balance = openingBalance;
  let totalInterest = 0;

  while (balance > 0.004 && rows.length < MAX_PERIODS) {
    const interestAmount = round2(balance * monthlyRate);
    const principalAmount = round2(
      Math.min(monthlyPayment - interestAmount, balance),
    );
    balance = round2(balance - principalAmount);
    totalInterest = round2(totalInterest + interestAmount);
    rows.push({
      installmentNumber: rows.length + 1,
      dueDate: stepDate(firstDueDate, rows.length, 'monthly'),
      principalAmount,
      interestAmount,
    });
  }

  if (balance > 0.004) return { ok: false, error: 'TOO_MANY_PERIODS' };

  return {
    ok: true,
    rows,
    totalInterest,
    totalPaid: round2(openingBalance + totalInterest),
  };
};
