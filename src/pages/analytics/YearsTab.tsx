/** WealthLens — แท็บรายปี (F50): ตารางภาพรวมทุกปี + เทียบข้ามปี. */
import type { ReactNode } from 'react';

import { AllYearsSummary } from '@/components/analytics/AllYearsSummary';
import { MultiYearComparison } from '@/components/analytics/MultiYearComparison';

export const YearsTab = (): ReactNode => (
  <div className="space-y-6">
    <AllYearsSummary />
    <MultiYearComparison />
  </div>
);

export default YearsTab;
