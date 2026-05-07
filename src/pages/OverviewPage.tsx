import type { ReactNode } from 'react';

import { KpiCardGrid } from '@/components/dashboard/KpiCardGrid';
import { IncomeExpenseChart } from '@/components/dashboard/IncomeExpenseChart';
import { ExpensePieChart } from '@/components/dashboard/ExpensePieChart';
import { MonthlySummaryTable } from '@/components/dashboard/MonthlySummaryTable';
import { SavingsGoalCard } from '@/components/dashboard/SavingsGoalCard';
import { TravelSavingsCard } from '@/components/dashboard/TravelSavingsCard';

export const OverviewPage = (): ReactNode => {
  return (
    <div className="space-y-6">
      <KpiCardGrid />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SavingsGoalCard />
        <TravelSavingsCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <IncomeExpenseChart />
        </div>
        <div className="lg:col-span-1">
          <ExpensePieChart />
        </div>
      </div>

      <MonthlySummaryTable />
    </div>
  );
};

export default OverviewPage;
