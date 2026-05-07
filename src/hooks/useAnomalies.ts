/**
 * useAnomalies — F15.
 *
 * Subscribes to the stable `s.data` ref on the finance store and derives
 * the current anomaly list via `useMemo`. Same safety pattern as every
 * other selector hook in this codebase: NEVER pass a closure that
 * synthesises a fresh array directly to `useFinanceStore` — the default
 * `Object.is` equality treats every fresh `[...]` as "changed" and
 * triggers an infinite re-render loop. See useFinanceData.ts for the
 * canonical doc-comment.
 */

import { useMemo } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { detectAnomalies, type Anomaly } from '@/utils/anomalyDetection';

export const useAnomalies = (): Anomaly[] => {
  const data = useFinanceStore((s) => s.data);
  return useMemo(() => detectAnomalies(data), [data]);
};
