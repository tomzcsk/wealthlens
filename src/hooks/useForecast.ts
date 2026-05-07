/**
 * useForecast — React binding for `computeForecast`.
 *
 * Follows the safety pattern documented at the top of `useFinanceData.ts`:
 * subscribe to the stable `s.data` reference, then derive via `useMemo`. We
 * never return a freshly-built object directly from `useFinanceStore` —
 * Zustand's default `Object.is` equality would treat each new object as a
 * change and trigger an infinite render loop.
 */

import { useMemo } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { computeForecast, type MonthForecast } from '@/utils/forecast';

export const useForecast = (): MonthForecast | null => {
  const data = useFinanceStore((s) => s.data);
  return useMemo(() => computeForecast(data), [data]);
};
