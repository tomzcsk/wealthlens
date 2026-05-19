/**
 * WealthLens — Gold purchase entry form.
 *
 * Captures one physical-gold transaction and writes BOTH halves of the
 * dual entry: a `GoldHolding` on the asset ledger and either a
 * `SavingsItem` (paymentMethod=cash) or a `keptBalances` decrement
 * (paymentMethod=kept) on the cashflow ledger. The store does the
 * actual writes; this form just collects the inputs and previews the
 * effect before save.
 *
 * Edit mode is metadata-only — totalCost / weightBaht / paymentMethod /
 * purchaseDate are NOT editable post-create. Changing those would
 * require re-coordinating the side-effect, which Tom can do by deleting
 * + re-adding the holding instead.
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
import type {
  GoldHolding,
  GoldPaymentMethod,
  GoldPurity,
  GoldType,
} from '@/types';
import { GRAMS_PER_BAHT } from '@/types';
import {
  formatNumber,
  formatTHB,
  formatThaiMonthYear,
} from '@/utils/formatters';

export interface GoldFormProps {
  /** Existing holding → edit mode (metadata only). */
  initialValues?: GoldHolding | null;
  onSaved?: (holdingId: string) => void;
  onCancel?: () => void;
}

interface FormErrors {
  brand?: string;
  weightBaht?: string;
  totalCost?: string;
  purchaseDate?: string;
}

interface FormTouched {
  brand?: boolean;
  weightBaht?: boolean;
  totalCost?: boolean;
  purchaseDate?: boolean;
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

const validate = (v: {
  brand: string;
  weightBaht: number;
  totalCost: number;
  purchaseDate: string;
}): FormErrors => {
  const errors: FormErrors = {};
  if (v.brand.trim() === '') errors.brand = 'กรอกแบรนด์/ร้าน';
  if (!(v.weightBaht > 0)) errors.weightBaht = 'น้ำหนักต้องมากกว่า 0';
  if (!(v.totalCost > 0)) errors.totalCost = 'ราคาต้องมากกว่า 0';
  if (v.purchaseDate.trim() === '') errors.purchaseDate = 'กรอกวันที่ซื้อ';
  return errors;
};

/**
 * Strip trailing zeros from a decimal weight so "1.5" doesn't appear as
 * "1.500" in the input field after editing.
 */
const trimDecimal = (n: number): string => {
  if (!Number.isFinite(n)) return '';
  return n.toString();
};

export const GoldForm = ({
  initialValues,
  onSaved,
  onCancel,
}: GoldFormProps): ReactNode => {
  const addGoldHolding = useFinanceStore((s) => s.addGoldHolding);
  const updateGoldHolding = useFinanceStore((s) => s.updateGoldHolding);

  const isEdit = initialValues != null;

  const [purchaseDate, setPurchaseDate] = useState<string>(
    initialValues?.purchaseDate ?? todayIso(),
  );
  const [brand, setBrand] = useState<string>(initialValues?.brand ?? '');
  const [type, setType] = useState<GoldType>(initialValues?.type ?? 'bar');
  const [purity, setPurity] = useState<GoldPurity>(
    initialValues?.purity ?? '96.5',
  );
  const [weightInput, setWeightInput] = useState<string>(
    initialValues != null ? trimDecimal(initialValues.weightBaht) : '1',
  );
  const [totalCostInput, setTotalCostInput] = useState<string>(
    initialValues != null ? formatNumber(initialValues.totalCost) : '',
  );
  const [spotInput, setSpotInput] = useState<string>(
    initialValues?.spotPriceAtPurchase != null
      ? formatNumber(initialValues.spotPriceAtPurchase)
      : '',
  );
  const [paymentMethod, setPaymentMethod] =
    useState<GoldPaymentMethod>(initialValues?.paymentMethod ?? 'cash');
  const [notes, setNotes] = useState<string>(initialValues?.notes ?? '');
  const [touched, setTouched] = useState<FormTouched>({});

  const dateId = useId();
  const brandId = useId();
  const weightId = useId();
  const costId = useId();
  const spotId = useId();
  const notesId = useId();

  const weightBaht = useMemo(() => parseAmount(weightInput), [weightInput]);
  const totalCost = useMemo(() => parseAmount(totalCostInput), [
    totalCostInput,
  ]);
  const spotPriceAtPurchase = useMemo(() => parseAmount(spotInput), [
    spotInput,
  ]);

  const errors = useMemo(
    () => validate({ brand, weightBaht, totalCost, purchaseDate }),
    [brand, weightBaht, totalCost, purchaseDate],
  );
  const isValid = Object.keys(errors).length === 0;

  // Live preview values — purely derived, only shown when meaningful.
  const preview = useMemo(() => {
    if (!(weightBaht > 0) || !(totalCost > 0)) return null;
    const grams = weightBaht * GRAMS_PER_BAHT;
    const pricePerBaht = totalCost / weightBaht;
    const markup =
      spotPriceAtPurchase > 0
        ? ((pricePerBaht - spotPriceAtPurchase) / spotPriceAtPurchase) * 100
        : null;
    let monthLabel: string | null = null;
    if (purchaseDate) {
      const dt = new Date(`${purchaseDate}T00:00:00`);
      if (!Number.isNaN(dt.getTime())) {
        monthLabel = formatThaiMonthYear(dt.getMonth() + 1, dt.getFullYear());
      }
    }
    return { grams, pricePerBaht, markup, monthLabel };
  }, [weightBaht, totalCost, spotPriceAtPurchase, purchaseDate]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched({
      brand: true,
      weightBaht: true,
      totalCost: true,
      purchaseDate: true,
    });
    if (!isValid) return;

    if (isEdit && initialValues != null) {
      updateGoldHolding(initialValues.id, {
        brand: brand.trim(),
        type,
        purity,
        notes: notes.trim() || undefined,
        spotPriceAtPurchase:
          spotPriceAtPurchase > 0 ? spotPriceAtPurchase : undefined,
      });
      onSaved?.(initialValues.id);
      return;
    }

    const id = addGoldHolding({
      purchaseDate,
      brand: brand.trim(),
      type,
      purity,
      weightBaht,
      totalCost,
      ...(spotPriceAtPurchase > 0
        ? { spotPriceAtPurchase }
        : {}),
      ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
      paymentMethod,
    });
    onSaved?.(id);
  };

  const inputBaseClass =
    'w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';
  const errorClass = 'mt-1 text-xs text-expense';
  const radioBtnClass = (active: boolean): string =>
    `flex-1 px-3 py-2 text-sm font-medium rounded-md border transition cursor-pointer ${
      active
        ? 'bg-primary text-white border-primary'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label={isEdit ? 'แก้ไขข้อมูลทอง' : 'บันทึกการซื้อทอง'}
    >
      {/* Purchase date */}
      <div>
        <label htmlFor={dateId} className={labelClass}>
          วันที่ซื้อ
        </label>
        <input
          id={dateId}
          type="date"
          value={purchaseDate}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setPurchaseDate(e.target.value)
          }
          onBlur={() => setTouched((t) => ({ ...t, purchaseDate: true }))}
          disabled={isEdit}
          className={`${inputBaseClass} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
        />
        {touched.purchaseDate === true && errors.purchaseDate !== undefined && (
          <p className={errorClass}>{errors.purchaseDate}</p>
        )}
        {isEdit && (
          <p className="mt-1 text-xs text-slate-400">
            วันที่ + ราคา + วิธีจ่าย แก้ไขไม่ได้หลังสร้างแล้ว — ถ้าจะแก้
            ให้ลบแล้วเพิ่มใหม่
          </p>
        )}
      </div>

      {/* Brand */}
      <div>
        <label htmlFor={brandId} className={labelClass}>
          แบรนด์ / ร้าน
        </label>
        <input
          id={brandId}
          type="text"
          value={brand}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setBrand(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, brand: true }))}
          placeholder="ฮั่วเซ่งเฮง, ออโรร่า, MTS Gold, ฯลฯ"
          className={inputBaseClass}
        />
        {touched.brand === true && errors.brand !== undefined && (
          <p className={errorClass}>{errors.brand}</p>
        )}
      </div>

      {/* Type */}
      <div>
        <span className={labelClass}>ประเภท</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('bar')}
            className={radioBtnClass(type === 'bar')}
            aria-pressed={type === 'bar'}
          >
            🟨 ทองคำแท่ง
          </button>
          <button
            type="button"
            onClick={() => setType('jewelry')}
            className={radioBtnClass(type === 'jewelry')}
            aria-pressed={type === 'jewelry'}
          >
            💍 ทองรูปพรรณ
          </button>
        </div>
      </div>

      {/* Purity */}
      <div>
        <span className={labelClass}>ความบริสุทธิ์</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPurity('96.5')}
            className={radioBtnClass(purity === '96.5')}
            aria-pressed={purity === '96.5'}
          >
            96.5%
          </button>
          <button
            type="button"
            onClick={() => setPurity('99.99')}
            className={radioBtnClass(purity === '99.99')}
            aria-pressed={purity === '99.99'}
          >
            99.99%
          </button>
        </div>
      </div>

      {/* Weight + total cost */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={weightId} className={labelClass}>
            น้ำหนัก (บาททอง)
          </label>
          <input
            id={weightId}
            type="number"
            step="0.0001"
            min="0"
            value={weightInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setWeightInput(e.target.value)
            }
            onBlur={() => setTouched((t) => ({ ...t, weightBaht: true }))}
            disabled={isEdit}
            placeholder="1"
            className={`${inputBaseClass} financial-number text-right ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
          {weightBaht > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              = {formatNumber(weightBaht * GRAMS_PER_BAHT, { decimals: 3 })} กรัม
            </p>
          )}
          {touched.weightBaht === true && errors.weightBaht !== undefined && (
            <p className={errorClass}>{errors.weightBaht}</p>
          )}
        </div>
        <div>
          <label htmlFor={costId} className={labelClass}>
            ราคาที่จ่าย (฿)
          </label>
          <input
            id={costId}
            type="text"
            inputMode="decimal"
            value={displayAmount(totalCostInput)}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setTotalCostInput(e.target.value)
            }
            onBlur={() => setTouched((t) => ({ ...t, totalCost: true }))}
            disabled={isEdit}
            placeholder="42,800"
            className={`${inputBaseClass} financial-number text-right ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
          {touched.totalCost === true && errors.totalCost !== undefined && (
            <p className={errorClass}>{errors.totalCost}</p>
          )}
        </div>
      </div>

      {/* Spot price at purchase (optional) */}
      <div>
        <label htmlFor={spotId} className={labelClass}>
          ราคา spot ตอนซื้อ (฿/บาททอง) — optional
        </label>
        <input
          id={spotId}
          type="text"
          inputMode="decimal"
          value={displayAmount(spotInput)}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setSpotInput(e.target.value)
          }
          placeholder="42,000"
          className={`${inputBaseClass} financial-number text-right`}
        />
        <p className="mt-1 text-xs text-slate-400">
          ใช้คำนวณ markup% เทียบกับราคาที่จ่ายจริง
        </p>
      </div>

      {/* Payment method */}
      <div>
        <span className={labelClass}>จ่ายด้วยอะไร</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod('cash')}
            disabled={isEdit}
            className={`${radioBtnClass(paymentMethod === 'cash')} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-pressed={paymentMethod === 'cash'}
          >
            💸 เงินสด / เงินเดือน
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('kept')}
            disabled={isEdit}
            className={`${radioBtnClass(paymentMethod === 'kept')} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-pressed={paymentMethod === 'kept'}
          >
            🏦 หัก Kept
          </button>
        </div>
      </div>

      {/* Notes */}
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
          placeholder="เช่น เลขใบรับรอง, ขายให้ใคร, ฯลฯ"
          className={inputBaseClass}
        />
      </div>

      {/* Live preview */}
      {preview && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-600">ราคา/บาททอง</span>
            <span className="financial-number font-semibold text-amber-900">
              {formatTHB(preview.pricePerBaht, { decimals: 0 })}
            </span>
          </div>
          {preview.markup != null && (
            <div className="flex items-baseline justify-between gap-2 text-xs text-slate-600">
              <span>markup vs spot</span>
              <span
                className={`financial-number ${preview.markup >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}
              >
                {preview.markup >= 0 ? '+' : ''}
                {preview.markup.toFixed(2)}%
              </span>
            </div>
          )}
          {!isEdit && preview.monthLabel && (
            <div className="pt-2 mt-2 border-t border-amber-200 text-xs text-slate-600">
              {paymentMethod === 'cash' ? (
                <>
                  💸 จะเพิ่ม{' '}
                  <span className="font-semibold text-amber-900">
                    ออม/ลงทุน {formatTHB(totalCost)}
                  </span>{' '}
                  ในเดือน {preview.monthLabel}
                </>
              ) : (
                <>
                  🏦 จะหัก{' '}
                  <span className="font-semibold text-amber-900">
                    Kept {formatTHB(totalCost)}
                  </span>{' '}
                  ของเดือน {preview.monthLabel}
                </>
              )}
            </div>
          )}
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
          {isEdit ? 'บันทึก' : 'บันทึกการซื้อ'}
        </button>
      </div>
    </form>
  );
};

export default GoldForm;
