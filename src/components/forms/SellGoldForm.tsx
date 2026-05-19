/**
 * WealthLens — Gold sale entry form.
 *
 * Records a sale on an existing GoldHolding. Realized P&L = soldPrice -
 * totalCost (cost basis) is shown live before saving. No automatic
 * cashflow side-effect on sell — proceeds typically become untracked
 * cash; if Tom puts the money into Kept, he'll log that himself via
 * the existing Kept editor.
 */

import {
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import type { GoldHolding } from '@/types';
import { formatNumber, formatTHB } from '@/utils/formatters';

export interface SellGoldFormProps {
  holding: GoldHolding;
  onSaved?: () => void;
  onCancel?: () => void;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const parseAmount = (input: string): number => {
  if (input.trim() === '') return 0;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

const displayAmount = (raw: string): string => {
  if (raw === '') return raw;
  const endsWithDot = raw.endsWith('.');
  const numeric = parseAmount(raw);
  if (numeric === 0 && raw.replace(/[^0-9]/g, '') === '') return raw;
  const [, decimalPart] = raw.split('.');
  if (decimalPart !== undefined) {
    return `${formatNumber(Math.trunc(numeric))}.${decimalPart}`;
  }
  return formatNumber(numeric) + (endsWithDot ? '.' : '');
};

export const SellGoldForm = ({
  holding,
  onSaved,
  onCancel,
}: SellGoldFormProps): ReactNode => {
  const sellGoldHolding = useFinanceStore((s) => s.sellGoldHolding);

  const [soldDate, setSoldDate] = useState<string>(
    holding.sold?.soldDate ?? todayIso(),
  );
  const [soldPriceInput, setSoldPriceInput] = useState<string>(
    holding.sold?.soldPrice != null
      ? formatNumber(holding.sold.soldPrice)
      : '',
  );
  const [notes, setNotes] = useState<string>(holding.sold?.notes ?? '');
  const [touched, setTouched] = useState({ soldPrice: false });

  const dateId = useId();
  const priceId = useId();
  const notesId = useId();

  const soldPrice = useMemo(() => parseAmount(soldPriceInput), [
    soldPriceInput,
  ]);

  const isValid = soldPrice > 0 && soldDate.trim() !== '';

  const pnl = useMemo(() => {
    if (!(soldPrice > 0)) return null;
    const value = soldPrice - holding.totalCost;
    const pct = holding.totalCost > 0 ? (value / holding.totalCost) * 100 : 0;
    return { value, pct };
  }, [soldPrice, holding.totalCost]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched({ soldPrice: true });
    if (!isValid) return;
    sellGoldHolding(holding.id, {
      soldDate,
      soldPrice,
      ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
    });
    onSaved?.();
  };

  const inputBaseClass =
    'w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label="บันทึกการขายทอง"
    >
      <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-700">
          <span className="font-semibold">{holding.brand}</span> ·{' '}
          {holding.weightBaht} บาท · ซื้อเมื่อ {holding.purchaseDate}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ต้นทุน {formatTHB(holding.totalCost)}
        </p>
      </div>

      <div>
        <label htmlFor={dateId} className={labelClass}>
          วันที่ขาย
        </label>
        <input
          id={dateId}
          type="date"
          value={soldDate}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setSoldDate(e.target.value)
          }
          className={inputBaseClass}
        />
      </div>

      <div>
        <label htmlFor={priceId} className={labelClass}>
          ราคาที่ขายได้ (฿)
        </label>
        <input
          id={priceId}
          type="text"
          inputMode="decimal"
          value={displayAmount(soldPriceInput)}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setSoldPriceInput(e.target.value)
          }
          onBlur={() => setTouched({ soldPrice: true })}
          placeholder="45,000"
          className={`${inputBaseClass} financial-number text-right`}
        />
        {touched.soldPrice && !(soldPrice > 0) && (
          <p className="mt-1 text-xs text-expense">ราคาขายต้องมากกว่า 0</p>
        )}
      </div>

      <div>
        <label htmlFor={notesId} className={labelClass}>
          หมายเหตุ (optional)
        </label>
        <textarea
          id={notesId}
          value={notes}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setNotes(e.target.value)
          }
          rows={2}
          placeholder="เช่น ขายให้ร้านอะไร, ราคาทองวันนั้น, ฯลฯ"
          className={inputBaseClass}
        />
      </div>

      {pnl && (
        <div
          className={`rounded-md px-4 py-3 text-sm border ${
            pnl.value >= 0
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-700 font-medium">
              {pnl.value >= 0 ? 'กำไร' : 'ขาดทุน'}
            </span>
            <span
              className={`financial-number font-bold text-lg ${
                pnl.value >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {pnl.value >= 0 ? '+' : ''}
              {formatTHB(pnl.value)} ({pnl.value >= 0 ? '+' : ''}
              {pnl.pct.toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel != null && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition"
          >
            ยกเลิก
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          บันทึกการขาย
        </button>
      </div>
    </form>
  );
};

export default SellGoldForm;
