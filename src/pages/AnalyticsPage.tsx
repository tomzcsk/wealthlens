/**
 * WealthLens — หน้าวิเคราะห์ (F50).
 *
 * เดิมเป็นเครื่องมือ 6 อย่างคนละเรื่องกองซ้อนกันในหน้าเดียว = 7.8 จอบนมือถือ
 * ตอนนี้เป็น 3 แท็บที่ lazy แยกกันจริง — เปิดแท็บหนึ่ง แผงของแท็บอื่นไม่อยู่ใน
 * DOM เลย (ไม่ใช่ hidden). สถานะอยู่ใน URL: ปุ่มย้อนกลับ/บุ๊กมาร์กใช้ได้
 */
import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import RouteLoader from '@/components/ui/RouteLoader';
import { ANALYTICS_TABS, resolveTab, type AnalyticsTabId } from '@/lib/analyticsTabs';

const YearsTab = lazy(() => import('@/pages/analytics/YearsTab'));
const TrendsTab = lazy(() => import('@/pages/analytics/TrendsTab'));
const SubscriptionsTab = lazy(() => import('@/pages/analytics/SubscriptionsTab'));

/**
 * ทะเบียนเก็บ "ตัวคอมโพเนนต์" ไม่ใช่ "element ที่สร้างไว้แล้ว" — render เฉพาะ
 * ตัวที่เลือก อีกสองตัวไม่ถูกเรียกใช้เลย จึงไม่ mount และไม่โหลด chunk (กฎ A2)
 */
const TAB_PANELS: Record<AnalyticsTabId, ComponentType> = {
  years: YearsTab,
  trends: TrendsTab,
  subs: SubscriptionsTab,
};

const tabBase =
  'inline-flex items-center justify-center min-h-11 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors';
const tabOn = 'bg-primary text-white';
const tabOff = 'bg-card text-ink-600 border border-ink-200 hover:bg-hover';

export const AnalyticsPage = (): ReactNode => {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = resolveTab(searchParams.get('tab'));
  const ActivePanel = TAB_PANELS[active];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-900">วิเคราะห์</h1>

      {/* เลื่อนแนวนอนได้บนมือถือ — 3 แท็บพอดีจอ 390px แต่ชื่อยาวขึ้นเมื่อไรก็ยังรอด */}
      <div
        data-testid="analytics-tabs"
        role="tablist"
        aria-label="มุมมองการวิเคราะห์"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-current={active === tab.id ? 'page' : undefined}
            onClick={() => setSearchParams({ tab: tab.id }, { replace: false })}
            className={`${tabBase} ${active === tab.id ? tabOn : tabOff}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key={active} — บังคับให้ Suspense รีเซ็ตเมื่อสลับแท็บ ไม่งั้นแท็บใหม่จะ
          โผล่มาแทนที่แท็บเก่าแบบกระตุก โดยไม่มีสถานะกำลังโหลด */}
      <Suspense key={active} fallback={<RouteLoader />}>
        <ActivePanel />
      </Suspense>
    </div>
  );
};

export default AnalyticsPage;
