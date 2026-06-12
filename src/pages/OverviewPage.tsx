import type { ReactNode } from 'react';

import { DimeInvestmentCard } from '@/components/dashboard/DimeInvestmentCard';
import { KpiCardGrid } from '@/components/dashboard/KpiCardGrid';
import { IncomeExpenseChart } from '@/components/dashboard/IncomeExpenseChart';
import { ExpensePieChart } from '@/components/dashboard/ExpensePieChart';
import { LoanSummaryCard } from '@/components/dashboard/LoanSummaryCard';
import { MonthlySummaryTable } from '@/components/dashboard/MonthlySummaryTable';
import { ReimbursementCard } from '@/components/dashboard/ReimbursementCard';
import { SavingsCategoryCard } from '@/components/dashboard/SavingsCategoryCard';
import { SavingsGoalCard } from '@/components/dashboard/SavingsGoalCard';
import { TravelSavingsCard } from '@/components/dashboard/TravelSavingsCard';
import {
  useSavingsCategoryTotals,
  useSelectedYear,
} from '@/hooks/useFinanceData';

export const OverviewPage = (): ReactNode => {
  const selectedYear = useSelectedYear();
  const savingsCategoryTotals = useSavingsCategoryTotals(selectedYear);

  return (
    <div className="space-y-6">
      <KpiCardGrid />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SavingsGoalCard />
        <DimeInvestmentCard />
        <TravelSavingsCard />
        {savingsCategoryTotals.map((t) => (
          <SavingsCategoryCard
            key={t.category}
            category={t.category}
            total={t.total}
            itemCount={t.itemCount}
            year={selectedYear}
          />
        ))}
      </div>

      <LoanSummaryCard />

      <ReimbursementCard />

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
