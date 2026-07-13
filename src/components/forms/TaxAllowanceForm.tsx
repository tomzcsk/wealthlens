import { type ReactNode } from 'react';

import type { TaxAllowanceInputs } from '@/types';
import {
  type AllowanceLine,
  type TaxAllowanceLineKey,
} from '@/utils/taxCalculator';
import { formatNumber, formatTHB } from '@/utils/formatters';

interface TaxAllowanceFormProps {
  value: TaxAllowanceInputs;
  /** Resolved lines จาก resolveTaxAllowances — ใช้โชว์ badge cap. */
  lines: AllowanceLine[];
  onChange: (next: TaxAllowanceInputs) => void;
}

type NumericKey = {
  [K in keyof TaxAllowanceInputs]: TaxAllowanceInputs[K] extends number
    ? K
    : never;
}[keyof TaxAllowanceInputs];

interface FieldDef {
  key: NumericKey;
  lineKey: TaxAllowanceLineKey;
  label: string;
  hint: string;
}

interface FieldGroup {
  title: string;
  counts?: FieldDef[];
  money?: FieldDef[];
}

const GROUPS: FieldGroup[] = [
  {
    title: '👨‍👩‍👧 ครอบครัว',
    counts: [
      { key: 'childrenCount', lineKey: 'children', label: 'บุตร', hint: '30,000/คน — เฉพาะคนที่ไม่เข้าช่องถัดไป' },
      { key: 'childrenBorn2561Count', lineKey: 'childrenBorn2561', label: 'บุตรคนที่ 2+ (เกิด 2561+)', hint: '60,000/คน' },
      { key: 'parentsCount', lineKey: 'parents', label: 'พ่อแม่ (อายุ 60+)', hint: '30,000/คน สูงสุด 4' },
      { key: 'disabledCount', lineKey: 'disabled', label: 'ผู้พิการ/ทุพพลภาพ', hint: '60,000/คน' },
    ],
    money: [
      { key: 'prenatalCare', lineKey: 'prenatalCare', label: 'ฝากครรภ์/คลอดบุตร', hint: 'สูงสุด 60,000' },
    ],
  },
  {
    title: '🛡️ ประกัน',
    money: [
      { key: 'lifeInsurance', lineKey: 'lifeInsurance', label: 'ประกันชีวิต', hint: 'รวมสุขภาพ ≤100,000' },
      { key: 'healthInsurance', lineKey: 'healthInsurance', label: 'ประกันสุขภาพตนเอง', hint: '≤25,000' },
      { key: 'parentHealthInsurance', lineKey: 'parentHealthInsurance', label: 'ประกันสุขภาพพ่อแม่', hint: '≤15,000' },
      { key: 'pensionInsurance', lineKey: 'pensionInsurance', label: 'ประกันบำนาญ', hint: '≤15% ของเงินได้, ≤200,000' },
    ],
  },
  {
    title: '📈 ลงทุน/เกษียณ',
    money: [
      { key: 'rmf', lineKey: 'rmf', label: 'RMF', hint: '≤30%, กลุ่มเกษียณรวม ≤500,000' },
      { key: 'thaiEsg', lineKey: 'thaiEsg', label: 'ThaiESG', hint: '≤30%, ≤300,000' },
      { key: 'nationalSavingsFund', lineKey: 'nationalSavingsFund', label: 'กอช', hint: '≤30,000' },
    ],
  },
  {
    title: '🏠 บ้าน',
    money: [
      { key: 'homeLoanInterest', lineKey: 'homeLoanInterest', label: 'ดอกเบี้ยเงินกู้บ้าน', hint: '≤100,000' },
    ],
  },
  {
    title: '🎁 บริจาค + อื่นๆ',
    money: [
      { key: 'donationEducation', lineKey: 'donationEducation', label: 'บริจาคการศึกษา/รพ.รัฐ', hint: 'นับ ×2, ≤10%' },
      { key: 'donationGeneral', lineKey: 'donationGeneral', label: 'บริจาคทั่วไป', hint: '≤10%' },
      { key: 'other', lineKey: 'other', label: 'อื่นๆ (เช่น Easy E-Receipt)', hint: 'ตามมาตรการปีนั้น' },
    ],
  },
];

const findLine = (
  lines: AllowanceLine[],
  key: TaxAllowanceLineKey,
): AllowanceLine | undefined => lines.find((l) => l.key === key);

export const TaxAllowanceForm = ({
  value,
  lines,
  onChange,
}: TaxAllowanceFormProps): ReactNode => {
  const setNumber = (key: NumericKey, raw: string): void => {
    const digits = raw.replace(/[^\d]/g, '');
    onChange({ ...value, [key]: digits === '' ? 0 : Number(digits) });
  };

  return (
    <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">ลดหย่อน</h2>
        <label className="flex items-center gap-2 min-h-11 md:min-h-0">
          {/* กล่องติ๊ก native ขยายเป็น 44px ไม่ได้โดยไม่บวม — <label> ทั้งแถบคือพื้นที่กดจริง (F47/M2) */}
          <input
            data-tap-exempt
            type="checkbox"
            checked={value.spouseNoIncome}
            onChange={(e) =>
              onChange({ ...value, spouseNoIncome: e.target.checked })
            }
            className="h-5 w-5 md:h-4 md:w-4 rounded border-ink-300 text-primary-ink focus:ring-primary-ink"
          />
          <span className="text-sm text-ink-700">
            คู่สมรสไม่มีเงินได้ <span className="text-ink-400">(60,000)</span>
          </span>
        </label>
      </header>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="text-sm font-semibold text-ink-600">
            {group.title}
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.counts?.map((f) => (
              <CountField
                key={f.key}
                def={f}
                count={value[f.key]}
                line={findLine(lines, f.lineKey)}
                onChange={(raw) => setNumber(f.key, raw)}
              />
            ))}
            {group.money?.map((f) => (
              <MoneyField
                key={f.key}
                def={f}
                amount={value[f.key]}
                line={findLine(lines, f.lineKey)}
                onChange={(raw) => setNumber(f.key, raw)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
};

interface CountFieldProps {
  def: FieldDef;
  count: number;
  line: AllowanceLine | undefined;
  onChange: (raw: string) => void;
}

const CountField = ({ def, count, line, onChange }: CountFieldProps): ReactNode => (
  <label className="block">
    <span className="text-xs font-medium text-ink-600">
      {def.label} <span className="text-ink-400">({def.hint})</span>
    </span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={count === 0 ? '' : String(count)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-16 rounded-lg border border-ink-300 px-2 py-1.5 text-sm tabular-nums text-right focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
      />
      <span className="text-xs text-ink-500">คน</span>
      {line && line.applied > 0 && (
        <span className="text-xs tabular-nums text-ink-500">
          = {formatTHB(line.applied)}
        </span>
      )}
      <CapBadge line={line} />
    </div>
  </label>
);

interface MoneyFieldProps {
  def: FieldDef;
  amount: number;
  line: AllowanceLine | undefined;
  onChange: (raw: string) => void;
}

const MoneyField = ({ def, amount, line, onChange }: MoneyFieldProps): ReactNode => (
  <label className="block">
    <span className="text-xs font-medium text-ink-600">
      {def.label} <span className="text-ink-400">({def.hint})</span>
    </span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={amount === 0 ? '' : formatNumber(amount)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-lg border border-ink-300 px-3 py-1.5 text-sm tabular-nums text-right focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
      />
      <CapBadge line={line} />
    </div>
  </label>
);

const CapBadge = ({ line }: { line: AllowanceLine | undefined }): ReactNode => {
  if (!line || !line.capped) return null;
  return (
    <span className="shrink-0 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
      ใช้ได้ {formatTHB(line.applied)}
    </span>
  );
};

export default TaxAllowanceForm;
