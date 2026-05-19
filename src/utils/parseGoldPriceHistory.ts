/**
 * Parser for the "ราคาทองย้อนหลัง" tables on ทองคำราคา.com.
 *
 * Cloudflare blocks scripted fetches of that site, so Tom copy-pastes the
 * table text and we extract the gold-bar BUY price (the 3rd numeric column
 * after the date+round) — same column we use as `price965` everywhere else.
 *
 * Source layout per row:
 *   DD/MM/YYYY HH:MM  round  bar_buy  bar_sell  jewelry_buy  jewelry_sell  ...
 *   ^^^^^^^^^ ^^^^^   ^^^^^  ^^^^^^^
 *   Buddhist year     # of   <-- this is what we want
 *                     round
 *
 * Non-matching lines (Thai day headers, blank rows, footnotes) are silently
 * skipped — we never throw on malformed input, just report a count.
 */

import type { GoldPriceSnapshot } from '@/types';

export interface ParsedHistoryResult {
  /** Snapshots sorted oldest → newest, deduped by minute. */
  snapshots: GoldPriceSnapshot[];
  /** How many lines parsed cleanly. */
  rowsAccepted: number;
  /** Earliest fetchedAt in the result, or null. */
  earliest: string | null;
  /** Latest fetchedAt in the result, or null. */
  latest: string | null;
}

const LINE_REGEX =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(\d+)\s+([\d,]+\.\d+)/;

const BUDDHIST_OFFSET = 543;

const pad2 = (n: number): string => n.toString().padStart(2, '0');

export const parseGoldPriceHistory = (text: string): ParsedHistoryResult => {
  const byTime = new Map<string, GoldPriceSnapshot>();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = LINE_REGEX.exec(line);
    if (!m) continue;

    const [, day, month, beYear, hour, minute, roundStr, priceStr] = m;
    const ceYear = Number(beYear) - BUDDHIST_OFFSET;
    const dd = Number(day);
    const mm = Number(month);
    const hh = Number(hour);
    const mi = Number(minute);

    if (
      ceYear < 2020 ||
      ceYear > 2100 ||
      mm < 1 ||
      mm > 12 ||
      dd < 1 ||
      dd > 31 ||
      hh > 23 ||
      mi > 59
    ) {
      continue;
    }

    const price = Number(priceStr.replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) continue;

    // Bangkok-local clock → ISO at UTC+7. Storing as UTC ISO keeps the rest
    // of the app's date math timezone-agnostic.
    const localIso = `${ceYear}-${pad2(mm)}-${pad2(dd)}T${pad2(hh)}:${pad2(mi)}:00+07:00`;
    const fetchedAt = new Date(localIso).toISOString();
    byTime.set(fetchedAt, {
      fetchedAt,
      price965: price,
      round: `ครั้งที่ ${roundStr}`,
    });
  }

  const sorted = Array.from(byTime.values()).sort((a, b) =>
    a.fetchedAt < b.fetchedAt ? -1 : 1,
  );

  return {
    snapshots: sorted,
    rowsAccepted: sorted.length,
    earliest: sorted[0]?.fetchedAt ?? null,
    latest: sorted[sorted.length - 1]?.fetchedAt ?? null,
  };
};
