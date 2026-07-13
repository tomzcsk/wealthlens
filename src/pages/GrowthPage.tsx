/**
 * WealthLens — หน้าเติบโต (📉 เติบโต · F48).
 *
 * สองคำถามที่แอปตอบไม่ได้มาก่อน:
 *   1. "รวยขึ้นหรือเปล่า" — /wealth บอกได้แค่ตัวเลข **วันนี้** ไม่มีเส้นย้อนหลัง
 *   2. "เก็บได้กี่ % ของที่หาได้" — ยอดบาทเทียบข้ามเดือนไม่ได้เมื่อคอมมิชชั่นแกว่ง
 *
 * หน้านี้ **ประกอบอย่างเดียว ไม่คำนวณ** — เลขทุกตัวมาจาก utils/netWorthHistory.ts
 * และ utils/savingsRate.ts (pure, verify แล้ว 38 ข้อใน scripts/verify-growth.ts)
 *
 * สองอย่างที่ต้องระวังเป็นพิเศษ:
 *   • **ตัดอนาคตทิ้ง** — monthsIn() คืนครบ 12 เดือนของทุกปีที่มีข้อมูล รวมเดือนที่
 *     ยังไม่มาถึง. เดือนอนาคตไม่ใช่ประวัติ (แถมหนี้จะดูลดลงเพราะงวดอนาคตถูกนับว่า
 *     จ่ายแล้ว) → ตัดที่เดือนปัจจุบัน. จุดสุดท้ายจึงเท่ากับตัวเลขบนหน้า /wealth
 *   • **% เติบโตที่คร่อมจุดเริ่มติดตามบัญชีใหม่ = เทียบไม่ได้** — growthBetween()
 *     คืน null และหน้านี้พูดออกมาตรง ๆ ไม่ใช่ซ่อนหรือเดาเป็นตัวเลข
 */
import { useCallback, useMemo, type ReactNode } from 'react';

import { AnimatedNumber } from '@/components/motion';
import NetWorthHistoryChart from '@/components/growth/NetWorthHistoryChart';
import SavingsRateChart from '@/components/growth/SavingsRateChart';
import { useResolvedLoans } from '@/hooks/useFinanceData';
import { useFinanceStore } from '@/stores/financeStore';
import { selectInstallmentPlans } from '@/stores/selectors';
import { formatPercent, formatTHB } from '@/utils/formatters';
import { endOfMonth, toYm, ymLte, type Ym } from '@/utils/monthRange';
import { buildNetWorthHistory, growthBetween } from '@/utils/netWorthHistory';
import { buildSavingsRateSeries } from '@/utils/savingsRate';

export const GrowthPage = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const loans = useResolvedLoans();

  const snapshot = useMemo(() => ({ data }), [data]);
  const plans = useMemo(() => selectInstallmentPlans(snapshot), [snapshot]);

  /**
   * ราคาทอง ณ เดือนนั้น = snapshot ล่าสุดที่ fetchedAt ≤ สิ้นเดือน.
   * ไม่มี = null → buildNetWorthHistory ตกไปใช้ราคาทุนเอง + ติดธง goldIsCostBasis
   * (goldPriceHistory เป็นของใหม่ทั้งชุด เดือนเก่าจึงไม่มีราคาตลาดให้ใช้)
   */
  const goldPriceAt = useCallback(
    (ym: Ym): number | null => {
      const history = data.goldPriceHistory ?? [];
      const cutoff = endOfMonth(ym).getTime();
      let best: { at: number; price: number } | null = null;
      for (const snap of history) {
        const at = new Date(snap.fetchedAt).getTime();
        if (Number.isNaN(at) || at > cutoff) continue;
        if (best === null || at > best.at) best = { at, price: snap.price965 };
      }
      return best?.price ?? null;
    },
    [data.goldPriceHistory],
  );

  // เดือนปัจจุบัน — เส้นตัด "ประวัติ" ออกจาก "ยังไม่เกิดขึ้น"
  const currentYm = useMemo(() => {
    const now = new Date();
    return toYm(now.getFullYear(), now.getMonth() + 1);
  }, []);

  const history = useMemo(
    () =>
      buildNetWorthHistory(data, goldPriceAt, loans, plans).filter((p) =>
        ymLte(p.ym, currentYm),
      ),
    [data, goldPriceAt, loans, plans, currentYm],
  );

  const rates = useMemo(
    () => buildSavingsRateSeries(data).filter((p) => ymLte(p.ym, currentYm)),
    [data, currentYm],
  );

  const totalAccounts = data.bankAccounts?.length ?? 0;
  const latest = history[history.length - 1] ?? null;
  const previous = history.length >= 2 ? history[history.length - 2] : null;
  const growth =
    latest && previous ? growthBetween(previous, latest) : null;
  const growthUnavailable = latest !== null && previous !== null && growth === null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">📉 เติบโต</h1>
        <p className="mt-1 text-sm text-ink-500">
          รวยขึ้นหรือเปล่า · เก็บได้กี่ % ของที่หาได้
        </p>
      </div>

      {latest && (
        <section className="rounded-2xl border border-ink-200 bg-card p-6 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-ink-500">
            ความมั่งคั่งสุทธิล่าสุด
          </div>
          <div
            className={`financial-number mt-1 text-4xl font-bold tabular-nums ${
              latest.netWorth >= 0 ? 'text-ink-900' : 'text-expense-ink'
            }`}
          >
            <AnimatedNumber
              value={latest.netWorth}
              format={(v) => formatTHB(v, { decimals: 0 })}
            />
          </div>
          <div className="mt-2 text-sm">
            {growthUnavailable ? (
              <span className="text-ink-500">
                เทียบไม่ได้ (เริ่มติดตามบัญชีใหม่)
              </span>
            ) : growth !== null ? (
              <span
                className={
                  growth >= 0 ? 'text-income-ink' : 'text-expense-ink'
                }
              >
                <span className="financial-number tabular-nums font-semibold">
                  {formatPercent(growth, { signed: true })}
                </span>{' '}
                <span className="text-ink-500">เทียบเดือนก่อน</span>
              </span>
            ) : (
              <span className="text-ink-500">ยังไม่มีเดือนก่อนให้เทียบ</span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            ไม่รวมมูลค่าบ้านและรถ — นับเฉพาะเงินในบัญชี ทองคำ และเงินออม
            (ตัวเลขเดียวกับหน้าความมั่งคั่ง)
          </p>
        </section>
      )}

      <NetWorthHistoryChart points={history} totalAccounts={totalAccounts} />
      <SavingsRateChart points={rates} />
    </div>
  );
};

export default GrowthPage;
