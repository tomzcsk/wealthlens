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
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">ลดหย่อน</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.spouseNoIncome}
            onChange={(e) =>
              onChange({ ...value, spouseNoIncome: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-slate-700">
            คู่สมรสไม่มีเงินได้ <span className="text-slate-400">(60,000)</span>
          </span>
        </label>
      </header>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="text-sm font-semibold text-slate-600">
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
    <span className="text-xs font-medium text-slate-600">
      {def.label} <span className="text-slate-400">({def.hint})</span>
    </span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={count === 0 ? '' : String(count)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <span className="text-xs text-slate-500">คน</span>
      {line && line.applied > 0 && (
        <span className="text-xs tabular-nums text-slate-500">
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
    <span className="text-xs font-medium text-slate-600">
      {def.label} <span className="text-slate-400">({def.hint})</span>
    </span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={amount === 0 ? '' : formatNumber(amount)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <CapBadge line={line} />
    </div>
  </label>
);

const CapBadge = ({ line }: { line: AllowanceLine | undefined }): ReactNode => {
  if (!line || !line.capped) return null;
  return (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      ใช้ได้ {formatTHB(line.applied)}
    </span>
  );
};

export default TaxAllowanceForm;
