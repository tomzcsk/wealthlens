/**
 * WealthLens — Debt hub (หนี้สิน).
 *
 * WHY this file exists: "หนี้ระยะยาว" and "ผ่อนของ" are two genuinely
 * different data models that Tom kept confusing as two separate menu items.
 *   - หนี้ระยะยาว (LoansPage) — entities in `data.loans` with an amortization
 *     schedule that splits principal vs interest (money still owed).
 *   - ผ่อนของ (InstallmentsPage) — a *view* over ExpenseItems tagged with
 *     `installment.planId` (money already spent, equal งวด, no interest).
 * Merging them into ONE nav item with two tabs kills the confusion while
 * keeping both models fully intact — this is purely a navigation shell.
 *
 * URL contract: /loans and /installments both route here; the pathname is the
 * single source of truth for the active tab (no local state that could drift
 * from the address bar). Clicking a tab rewrites the URL via useNavigate, so a
 * reload/bookmark lands on the same tab and back/forward behave sanely.
 */

import { type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import InstallmentsPage from './InstallmentsPage';
import LoansPage from './LoansPage';

type TabKey = 'loans' | 'installments';

interface TabDef {
  key: TabKey;
  /** URL this tab owns — reloading/bookmarking it reopens the same tab. */
  path: string;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'loans', path: '/loans', label: 'หนี้ระยะยาว' },
  { key: 'installments', path: '/installments', label: 'ผ่อนของ' },
];

export const DebtPage = (): ReactNode => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // /installments → ผ่อนของ; ทุกอย่างอื่นที่ route มาที่นี่ (/loans) → หนี้ระยะยาว.
  const activeKey: TabKey =
    pathname === '/installments' ? 'installments' : 'loans';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">💰 หนี้สิน</h1>

      {/* Tab bar — plain buttons + aria-current (pill idiom reused from the
          year-toggle pills in MultiYearComparison). Buttons are natively
          keyboard-focusable; clicking one rewrites the URL, never local state. */}
      <div className="flex gap-2" aria-label="ประเภทหนี้">
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (!isActive) navigate(tab.path);
              }}
              className={[
                'rounded-full border px-4 py-1.5 text-sm font-medium transition',
                isActive
                  ? 'border-transparent bg-primary text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeKey === 'loans' ? <LoansPage /> : <InstallmentsPage />}
    </div>
  );
};

export default DebtPage;
