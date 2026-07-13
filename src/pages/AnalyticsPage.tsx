/**
 * Analytics page — multi-year comparison + (future) trend analysis.
 */

import type { ReactNode } from 'react';

import { AllYearsSummary } from '@/components/analytics/AllYearsSummary';
import { AnomalyAlerts } from '@/components/analytics/AnomalyAlerts';
import { MultiYearComparison } from '@/components/analytics/MultiYearComparison';
import { SubscriptionManager } from '@/components/analytics/SubscriptionManager';
import { TrendAnalysis } from '@/components/analytics/TrendAnalysis';

export const AnalyticsPage = (): ReactNode => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-900">วิเคราะห์</h1>
      <AllYearsSummary />
      <MultiYearComparison />
      <SubscriptionManager />
      <TrendAnalysis />
      <AnomalyAlerts />
    </div>
  );
};

export default AnalyticsPage;
