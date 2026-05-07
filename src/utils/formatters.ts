/**
 * WealthLens — number, money, and Thai date formatters.
 *
 * Per CLAUDE.md: every visible number in the app MUST flow through this
 * module. We standardise:
 *   - Currency rendering as `฿1,234,567(.89)` via `numeral`.
 *   - Compact axis labels as `฿1.23M` / `฿123k` for charts.
 *   - Thai short/long month names so chart axes never reach for `Date`.
 *
 * Pure functions, no side-effects, no global locale mutation.
 */

import numeral from 'numeral';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { th } from 'date-fns/locale/th';

// ---------------------------------------------------------------------------
// Thai month constants — exported so chart axes & dropdowns share one source.
// ---------------------------------------------------------------------------

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

export const THAI_MONTHS_LONG = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Guard against NaN / Infinity so a bad upstream calc never paints garbage. */
const safeNumber = (value: number): number =>
  Number.isFinite(value) ? value : 0;

/**
 * Coerce a Date-or-ISO-string input into a Date instance.
 * date-fns will throw on invalid input — we let it, since silently
 * formatting `Invalid Date` would mask real bugs in the sync layer.
 */
const toDate = (input: Date | string): Date =>
  typeof input === 'string' ? parseISO(input) : input;

/**
 * Numeral renders compacts as lowercase (`1.23m`, `123k`). Uppercase the
 * scale suffix for visual polish on chart axes — `M`/`B` reads cleaner than
 * `m`/`b` next to currency. Lowercase `k` stays (industry standard).
 */
const polishCompactSuffix = (s: string): string =>
  s.replace(/m$/i, 'M').replace(/b$/i, 'B').replace(/t$/i, 'T');

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface FormatTHBOptions {
  /** Render compact form (`฿1.23M`, `฿123k`) — for chart axes. */
  compact?: boolean;
  /** Decimal places. Defaults to 0 for cleaner KPI cards. */
  decimals?: 0 | 2;
}

/**
 * Format a baht amount.
 *   formatTHB(1234567)              → "฿1,234,567"
 *   formatTHB(1234567, {decimals:2})→ "฿1,234,567.00"
 *   formatTHB(1234567, {compact:true}) → "฿1.23M"
 *
 * Negative compact values keep their sign: `-฿1.23M`.
 */
export const formatTHB = (
  amount: number,
  opts: FormatTHBOptions = {},
): string => {
  const { compact = false, decimals = 0 } = opts;
  const value = safeNumber(amount);

  if (compact) {
    // numeral '0.[00]a' yields e.g. '1.23m', '123k', '0'
    const compactRaw = numeral(Math.abs(value)).format('0.[00]a');
    const polished = polishCompactSuffix(compactRaw);
    return `${value < 0 ? '-' : ''}฿${polished}`;
  }

  const fmt = decimals === 2 ? '0,0.00' : '0,0';
  // numeral handles negatives correctly: '-1,234' (no extra logic needed).
  return `฿${numeral(value).format(fmt)}`;
};

export interface FormatNumberOptions {
  /** Decimal places. Defaults to 0. */
  decimals?: number;
}

/**
 * Format a plain number with thousands separators — no currency prefix.
 *   formatNumber(1234567)              → "1,234,567"
 *   formatNumber(1234.5, {decimals:2}) → "1,234.50"
 */
export const formatNumber = (
  amount: number,
  opts: FormatNumberOptions = {},
): string => {
  const { decimals = 0 } = opts;
  const value = safeNumber(amount);
  const fractional = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
  return numeral(value).format(`0,0${fractional}`);
};

// ---------------------------------------------------------------------------
// Percent / delta
// ---------------------------------------------------------------------------

export interface FormatPercentOptions {
  /** Always prefix sign (`+12.3%` / `-4.5%`). */
  signed?: boolean;
  /** Decimal places. Defaults to 1. */
  decimals?: 1 | 2;
}

/**
 * Render a percentage from a fractional value (0.123 → "12.3%").
 *   formatPercent(0.123)                       → "12.3%"
 *   formatPercent(0.123, {signed:true})        → "+12.3%"
 *   formatPercent(-0.045, {signed:true, decimals:2}) → "-4.50%"
 */
export const formatPercent = (
  value: number,
  opts: FormatPercentOptions = {},
): string => {
  const { signed = false, decimals = 1 } = opts;
  const safe = safeNumber(value);
  const pct = safe * 100;
  const fixed = pct.toFixed(decimals);
  // toFixed gives "-0.0" for tiny negatives — normalise so we don't print "-0.0%".
  const normalised = Number(fixed) === 0 ? (0).toFixed(decimals) : fixed;
  const sign = signed && Number(normalised) > 0 ? '+' : '';
  return `${sign}${normalised}%`;
};

export type DeltaSign = 'positive' | 'negative' | 'zero';

export interface DeltaResult {
  text: string;
  sign: DeltaSign;
}

/**
 * Wrap `formatPercent(signed:true)` with a sign tag for color coding in UI.
 * Input is the fractional change (NOT a raw amount): 0.123 → "+12.3%".
 */
export const formatDelta = (value: number): DeltaResult => {
  const safe = safeNumber(value);
  const text = formatPercent(safe, { signed: true });
  let sign: DeltaSign = 'zero';
  // Compare on the rendered value to stay consistent with what the user sees
  // (a 0.0001 input rounds to "0.0%" → still 'zero', not 'positive').
  const numeric = Number.parseFloat(text);
  if (numeric > 0) sign = 'positive';
  else if (numeric < 0) sign = 'negative';
  return { text, sign };
};

// ---------------------------------------------------------------------------
// Months — Thai
// ---------------------------------------------------------------------------

export interface FormatThaiMonthOptions {
  /** Long form ("มกราคม") instead of short ("ม.ค."). */
  long?: boolean;
}

/**
 * 1 → "ม.ค.", 12 → "ธ.ค.". Pass `{ long: true }` for "มกราคม"–"ธันวาคม".
 * Returns "" for out-of-range input rather than throwing — chart axes
 * shouldn't crash on a stray data point.
 */
export const formatThaiMonth = (
  month: number,
  opts: FormatThaiMonthOptions = {},
): string => {
  const { long = false } = opts;
  if (!Number.isInteger(month) || month < 1 || month > 12) return '';
  const list = long ? THAI_MONTHS_LONG : THAI_MONTHS_SHORT;
  return list[month - 1];
};

/** "(4, 2026)" → "เมษายน 2026". Long form, with the year unchanged (CE). */
export const formatThaiMonthYear = (month: number, year: number): string => {
  const name = formatThaiMonth(month, { long: true });
  if (!name) return String(year);
  return `${name} ${year}`;
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * "6 พ.ค. 2026" — short Thai date, suitable for "last synced" timestamps.
 * Note: date-fns Thai locale uses CE years (not Buddhist), which keeps the
 * data layer year identifiers (2023–2026) consistent with displayed years.
 */
export const formatThaiDate = (date: Date | string): string =>
  format(toDate(date), 'd MMM yyyy', { locale: th });

/**
 * "5 นาทีที่แล้ว" / "2 ชั่วโมงที่แล้ว" — for sync status display.
 */
export const formatRelativeTime = (date: Date | string): string =>
  formatDistanceToNow(toDate(date), { locale: th, addSuffix: true });
