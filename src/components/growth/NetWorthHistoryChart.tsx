/**
 * NetWorthHistoryChart — F48
 *
 * "รวยขึ้นหรือเปล่า" ตอบด้วยเส้นเดียว: ความมั่งคั่งสุทธิรายเดือน
 * (/wealth ตอบได้แค่ "วันนี้เท่าไร" — สเปกของมันเขียนไว้เองว่ากราฟย้อนหลังคือ
 * งานอีกชิ้น. นี่คืองานชิ้นนั้น)
 *
 * กราฟนี้มีหน้าที่หนึ่งอย่างที่สำคัญกว่าความสวย: **ไม่โกหก**
 *   ก.ค. 2026 Tom เพิ่ม 5 บัญชีพร้อมกัน (เงินสดก้อนเดียว ฿150,000) ทั้งที่เงิน
 *   นั้นมีอยู่มาตลอด. เส้นจะกระโดด — และการปล่อยให้มันกระโดดเฉย ๆ คือการบอกว่า
 *   "เดือนนั้นรวยขึ้น" ซึ่งไม่จริง. กราฟจึงต้องพูดออกมาสามทาง:
 *     1. หมุด <ReferenceDot> ทุกเดือนที่เริ่มติดตามบัญชีใหม่ + บอกชื่อบัญชี
 *     2. ช่วงที่ยังครอบคลุมไม่ครบทุกบัญชี = **แถบพื้นหลังจาง** (<ReferenceArea>)
 *     3. tooltip บอกทั้งสามอย่าง (สินทรัพย์/หนี้/สุทธิ) + เตือนเมื่อทองยังคิด
 *        ด้วยราคาทุน
 *
 * **บทเรียนของรอบก่อน (สำคัญกว่าโค้ดบรรทัดไหนในไฟล์นี้):** เดิมช่วงที่ยัง
 * ครอบคลุมไม่ครบถูกวาดเป็นเส้นประ strokeOpacity 0.5. แต่ Tom เพิ่งบันทึกบัญชี
 * ครบใน "เดือนสุดท้าย" ของอนุกรม → คำเตือนจึงกลืนกราฟทั้งใบ (42 จาก 43 เดือน)
 * เหลือแค่ผืนขาว ทั้งที่ข้อมูลจริงเล่าเรื่องดี ๆ ว่าเงินดีขึ้น ฿3M ใน 3 ปีครึ่ง.
 * กฎที่ตามมา: **ข้อมูลจริงต้องดังที่สุดบนกราฟเสมอ — คำเตือนอยู่ข้างหลังมัน
 * ไม่ใช่ทับมัน.** เส้นนี้ไม่ใช่ค่าประมาณ มันคือความมั่งคั่งจริงจากข้อมูลที่มีจริง
 *
 * ไม่มีเส้นทำนายอนาคต — เราไม่เดา
 *
 * สี series เป็น hex ตรง (Recharts ยัดสีลง SVG presentation attribute ซึ่งไม่รับ
 * var() — F46); สีโครงกราฟมาจาก useChartTheme(); สีอื่นทั้งหมดเป็น token class
 */
import { useMemo, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartAnimation } from '@/lib/motion';
import { useChartTheme } from '@/hooks/useChartTheme';
import { CHART_BOX, chartBoxStyle } from '@/utils/chartSizing';
import { THAI_MONTHS_SHORT, formatTHB } from '@/utils/formatters';
import { parseYm } from '@/utils/monthRange';
import type { NetWorthPoint } from '@/utils/netWorthHistory';

/** UXUI.md §2 — Net violet (เส้นเดียวกับ "รายได้สุทธิ" ในหน้าวิเคราะห์). */
const COLOR_NET = '#7C3AED';

/** UXUI.md §2 — warning amber: ใช้เป็น "แถบพื้นหลัง" ของคำเตือน ไม่ใช่สีของข้อมูล */
const COLOR_CAVEAT = '#F59E0B';

const FULL_GRADIENT_ID = 'wl-networth-full-gradient';

/** "ก.ค. '26" — รูปแบบเดียวกับแกน X ของกราฟ 48 เดือน */
const labelOf = (ym: string): string => {
  const { year, month } = parseYm(ym);
  return `${THAI_MONTHS_SHORT[month - 1]} '${String(year).slice(-2)}`;
};

const yTickFormatter = (value: number): string =>
  formatTHB(value, { compact: true });

interface Row {
  ym: string;
  label: string;
  /** เส้นเดียว ทึบ เต็มความชัด — ข้อมูลจริงทุกเดือน ไม่แบ่งชั้นความน่าเชื่อถือ */
  netWorth: number;
  point: NetWorthPoint;
}

const toRows = (points: readonly NetWorthPoint[]): Row[] =>
  points.map((point) => ({
    ym: point.ym,
    label: labelOf(point.ym),
    netWorth: point.netWorth,
    point,
  }));

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipEntry {
  payload?: Row;
}

interface HistoryTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  totalAccounts: number;
}

const HistoryTooltip = ({
  active,
  payload,
  totalAccounts,
}: HistoryTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const { point } = row;

  return (
    <div className="rounded-lg border border-ink-200 bg-card px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-ink-700">{row.label}</div>
      <ul className="space-y-0.5">
        <li className="flex items-center justify-between gap-4 text-xs text-ink-700">
          <span>สินทรัพย์</span>
          <span className="font-semibold tabular-nums text-income-ink">
            {formatTHB(point.assets)}
          </span>
        </li>
        <li className="flex items-center justify-between gap-4 text-xs text-ink-700">
          <span>หนี้</span>
          <span className="font-semibold tabular-nums text-expense-ink">
            {formatTHB(point.debts)}
          </span>
        </li>
        <li className="mt-1 flex items-center justify-between gap-4 border-t border-ink-200 pt-1 text-xs">
          <span className="font-semibold text-ink-600">สุทธิ</span>
          <span className="font-semibold tabular-nums text-ink-900">
            {formatTHB(point.netWorth)}
          </span>
        </li>
      </ul>
      {point.accountsCovered < totalAccounts && (
        <p className="mt-1.5 text-[11px] text-ink-500">
          ครอบคลุม {point.accountsCovered} จาก {totalAccounts} บัญชี
        </p>
      )}
      {point.isTrackingJump && (
        <p className="mt-1 text-[11px] text-warning-ink">
          🔵 เริ่มติดตาม: {point.newAccounts.join(', ')}
        </p>
      )}
      {point.goldIsCostBasis && (
        <p className="mt-1 text-[11px] text-warning-ink">
          ⚠️ ทองคิดด้วยราคาทุน
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NetWorthHistoryChartProps {
  points: readonly NetWorthPoint[];
  /** จำนวนบัญชีทั้งหมดที่มีอยู่วันนี้ — ใช้วัดว่าเส้นช่วงไหน "ครอบคลุมไม่ครบ" */
  totalAccounts: number;
  height?: number;
}

export const NetWorthHistoryChart = ({
  points,
  totalAccounts,
  height = 320,
}: NetWorthHistoryChartProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  const anim = chartAnimation(reduced);
  const chart = useChartTheme();

  const rows = useMemo(() => toRows(points), [points]);
  const jumps = useMemo(
    () => points.filter((p) => p.isTrackingJump),
    [points],
  );
  const partialMonths = useMemo(
    () => points.filter((p) => p.accountsCovered < totalAccounts),
    [points, totalAccounts],
  );
  const firstPartial = partialMonths[0];
  const lastPartial = partialMonths[partialMonths.length - 1];
  const firstYm = points[0]?.ym;
  const lastYm = points[points.length - 1]?.ym;

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-ink-200 bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-900">
          ความมั่งคั่งสุทธิย้อนหลัง
        </h2>
        <div
          className={`flex items-center justify-center text-sm text-ink-400 ${CHART_BOX}`}
          style={chartBoxStyle(height)}
          role="status"
        >
          ยังไม่มีข้อมูล
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-card p-4 shadow-sm md:p-6">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">
          ความมั่งคั่งสุทธิย้อนหลัง
        </h2>
        <p className="text-xs text-ink-500">
          สินทรัพย์ − หนี้ ณ สิ้นเดือน · {rows[0].label} – {rows[rows.length - 1].label}
        </p>
      </header>

      <div className={CHART_BOX} style={chartBoxStyle(height)}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 24, right: 16, bottom: 0, left: 8 }}
          >
            <defs>
              <linearGradient id={FULL_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_NET} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR_NET} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chart.grid}
              vertical={false}
            />
            <XAxis
              dataKey="ym"
              tickFormatter={labelOf}
              stroke={chart.axisTick}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chart.axisLine }}
              /* 43 เดือนบนจอ 390px = ป้ายทับกันจนอ่านไม่ออก. ปล่อยให้ Recharts
                 ตัดป้ายที่ชนกันเองตามความกว้างจริง แทนการตายตัวทุก 3 เดือน */
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              stroke={chart.axisTick}
              tick={{ fontSize: 12 }}
              tickFormatter={yTickFormatter}
              tickLine={false}
              axisLine={{ stroke: chart.axisLine }}
              width={64}
            />
            <Tooltip
              content={<HistoryTooltip totalAccounts={totalAccounts} />}
              cursor={{ stroke: chart.cursorStroke, strokeDasharray: '3 3' }}
            />
            {/* คำเตือนอยู่ "หลัง" เส้น: แถบพื้นหลังจาง ๆ คลุมเดือนที่ยังบันทึก
                ไม่ครบทุกบัญชี. วาดก่อน <Area> เพื่อให้เส้นทับมัน ไม่ใช่มันทับเส้น */}
            {firstPartial && lastPartial && (
              <ReferenceArea
                x1={firstPartial.ym}
                x2={lastPartial.ym}
                fill={COLOR_CAVEAT}
                fillOpacity={0.09}
                stroke="none"
                ifOverflow="extendDomain"
                label={{
                  value: 'บันทึกยังไม่ครบทุกบัญชี',
                  position: 'insideTopLeft',
                  fontSize: 10,
                  fill: chart.axisTick,
                }}
              />
            )}
            {/* เส้นเดียว ทึบ เต็มความชัด — ตัวเอกของกราฟ */}
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke={COLOR_NET}
              strokeWidth={2.5}
              /* ค่าทุกตัวติดลบ → baseline ปริยายของ Recharts คือ "ขอบบน" ของโดเมน
                 พื้นที่จึงพุ่งขึ้นไปเป็นเพดานแทนที่จะรองอยู่ใต้เส้น. ตรึงฐานไว้ที่
                 ค่าต่ำสุดของโดเมน ให้ไล่เฉดนั่งใต้เส้นเสมอ ไม่ว่าตัวเลขบวกหรือลบ */
              baseValue="dataMin"
              fill={`url(#${FULL_GRADIENT_ID})`}
              connectNulls={false}
              {...anim}
            />
            {jumps.map((p) => (
              <ReferenceDot
                key={p.ym}
                x={p.ym}
                y={p.netWorth}
                r={4}
                fill={COLOR_NET}
                stroke={COLOR_NET}
                strokeWidth={2}
                label={{
                  value:
                    p.newAccounts.length === 1
                      ? p.newAccounts[0]
                      : `+${p.newAccounts.length} บัญชีใหม่`,
                  // จุดกระโดดที่เป็นเดือนล่าสุด (ของจริง: ก.ค. 2026) นั่งชิดขอบขวา
                  // ป้ายวางบน "top" จะถูกตัดหาย — ย้ายไปทางซ้ายของหมุดแทน
                  position: p.ym === lastYm ? 'left' : 'top',
                  // ยกป้ายพ้นเส้น: ป้ายที่นั่งบนเส้นทำให้ทั้งคู่อ่านไม่ออกทั้งคู่
                  offset: 10,
                  dy: p.ym === lastYm ? -12 : -4,
                  // หมุดแรกนั่งชิดแกน Y — ป้ายที่จัดกึ่งกลางจะยื่นไปทับตัวเลขแกน
                  dx: p.ym === firstYm ? 18 : 0,
                  fontSize: 10,
                  fill: chart.axisTick,
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 space-y-1 border-t border-ink-200 pt-3 text-xs text-ink-500">
        {lastPartial && (
          <p>
            แถบสีจาง = ช่วงที่ยังบันทึกไม่ครบทุกบัญชี ({labelOf(partialMonths[0].ym)}{' '}
            – {labelOf(lastPartial.ym)}) — เดือนสุดท้ายของช่วงครอบคลุม{' '}
            {lastPartial.accountsCovered} จาก {totalAccounts} บัญชี. เส้นคือ
            ตัวเลขจริงจากข้อมูลที่มี ไม่ใช่ค่าประมาณ
          </p>
        )}
        {jumps.length > 0 && (
          <ul className="space-y-0.5">
            {jumps.map((p) => (
              <li key={p.ym}>
                🔵 {labelOf(p.ym)} เริ่มติดตาม: {p.newAccounts.join(', ')} — เส้นที่
                ขยับขึ้นตรงนี้คือวิธีนับที่เปลี่ยน ไม่ใช่เงินที่เพิ่ม
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default NetWorthHistoryChart;
