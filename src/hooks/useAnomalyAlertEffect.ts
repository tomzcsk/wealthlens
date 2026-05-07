/**
 * useAnomalyAlertEffect — F15 side effect.
 *
 * Passive observer mounted once at the Layout root. Watches the anomaly
 * list and pushes a toast when a NEW anomaly fingerprint appears. We use
 * a `useRef<Set<string>>` to remember which fingerprints we've already
 * "seen" — toasts are session-local UI events, not persisted state.
 *
 * Spam-on-load problem & resolution:
 *   The seed dataset contains years of historical spikes (iPhone 15pm,
 *   ทำฟัน, etc.) that all qualify as anomalies. If we toasted on every
 *   render, Tom would be drowned in notifications about expenses he made
 *   in 2024. Solution: on the FIRST render, we treat every existing
 *   anomaly as "already seen" without firing toasts. Only anomalies that
 *   appear AFTER initial mount — i.e. the result of new data being
 *   entered, imported, or synced from Drive — generate toasts.
 *
 * No DOM, no cleanup needed beyond React's normal effect lifecycle.
 */

import { useEffect, useRef } from 'react';

import { useToastStore, type ToastTone } from '@/stores/toastStore';
import { EXPENSE_CATEGORIES } from '@/types/expense-categories';
import {
  anomalyFingerprint,
  type Anomaly,
} from '@/utils/anomalyDetection';
import { THAI_MONTHS_SHORT, formatTHB } from '@/utils/formatters';

import { useAnomalies } from './useAnomalies';

const toneFor = (severity: Anomaly['severity']): ToastTone =>
  severity === 'high' ? 'error' : 'info';

const buildMessage = (a: Anomaly): string => {
  const cat = EXPENSE_CATEGORIES[a.category];
  const monthLabel = THAI_MONTHS_SHORT[a.month - 1] ?? '';
  const sigmaLabel = Number.isFinite(a.zScore)
    ? `${a.zScore.toFixed(1)}σ`
    : '∞σ';
  return `⚠️ ${cat.label} เดือน ${monthLabel} ${a.year}: ${formatTHB(
    a.amount,
  )} (สูงกว่าค่าเฉลี่ย ${sigmaLabel})`;
};

export const useAnomalyAlertEffect = (): void => {
  const anomalies = useAnomalies();

  /** Fingerprints we've already toasted — or marked as pre-existing on mount. */
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // FIRST RUN: seed the "seen" set with everything currently present so
    // we don't toast for historical spikes the user has already lived
    // through. Subsequent runs compute deltas against this baseline.
    if (seenRef.current === null) {
      seenRef.current = new Set(anomalies.map(anomalyFingerprint));
      return;
    }

    const seen = seenRef.current;
    const fresh: Anomaly[] = [];
    for (const a of anomalies) {
      const fp = anomalyFingerprint(a);
      if (!seen.has(fp)) {
        seen.add(fp);
        fresh.push(a);
      }
    }

    if (fresh.length === 0) return;

    const push = useToastStore.getState().push;
    for (const a of fresh) {
      push({
        tone: toneFor(a.severity),
        message: buildMessage(a),
      });
    }
  }, [anomalies]);
};

export default useAnomalyAlertEffect;
