/**
 * SavingsRateChart — F48
 *
 * "เก็บได้กี่ % ของที่หาได้" — รายได้ของ Tom ~45% เป็นคอมมิชชั่น เดือนคอมเยอะ
 * กับเดือนคอมน้อยจึงเทียบกันด้วยยอดบาทไม่ได้ ต้องเทียบด้วย %
 *
 * กฎเหล็กสองข้อ:
 *   1. **"ไม่มีข้อมูล" ≠ "เป็นศูนย์"** — เดือนที่ rate เป็น null (ทั้งปี 2023 ของ
 *      Tom ไม่มีรายจ่ายรายการเลย) ส่ง null เข้า Recharts ตรง ๆ ให้มันเว้นแท่ง
 *      ไว้. ถ้าเสียบ 0 แทน ปี 2023 จะกลายเป็นปีที่ "ออมเก่งที่สุด" ทั้งที่เป็นปีที่
 *      เรารู้น้อยที่สุด — กราฟกลายเป็นคนโกหกทันที
 *   2. **แท่งติดลบเป็นเรื่องจริง** (จ่ายเกินที่หาได้) — ใช้สีรายจ่าย ห้าม clamp เป็น 0
 *
 * สี series เป็น hex ตรง (Recharts ไม่รับ var() — F46); สีโครงกราฟจาก
 * useChartTheme(); สีอื่นทั้งหมดเป็น token class
 */
import { useMemo, type ReactNode } from 'react';
import { useReducedMotion } from '@/components/motion';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartAnimation } from '@/lib/motion';
import { useChartTheme } from '@/hooks/useChartTheme';
import { CHART_BOX, chartBoxStyle } from '@/utils/chartSizing';
import { THAI_MONTHS_SHORT, formatTHB, formatPercent } from '@/utils/formatters';
import { parseYm } from '@/utils/monthRange';
import { rollingAverage, type SavingsRatePoint } from '@/utils/savingsRate';

/** UXUI.md §2 — เขียวรายรับ / แดงรายจ่าย / ม่วงสุทธิ (ชุดเดียวกับกราฟอื่น) */
const COLOR_POSITIVE = '#34D399';
const COLOR_NEGATIVE = '#F87171';
const COLOR_AVERAGE = '#7C3AED';

/** ค่าเฉลี่ยเคลื่อนที่ 3 เดือน — สั้นพอจะยังเห็นฤดูกาล ยาวพอจะกลบเดือนโบนัส */
const AVERAGE_WINDOW = 3;

const labelOf = (ym: string): string => {
  const { year, month } = parseYm(ym);
  return `${THAI_MONTHS_SHORT[month - 1]} '${String(year).slice(-2)}`;
};

const yTickFormatter = (value: number): string => `${Math.round(value)}%`;

interface Row {
  ym: string;
  label: string;
  /** % — null = ไม่มีข้อมูลรายจ่ายเดือนนั้น (Recharts จะเว้นแท่งให้) */
  ratePct: number | null;
  avgPct: number | null;
  point: SavingsRatePoint;
}

interface TooltipEntry {
  payload?: Row;
}

interface RateTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
}

const RateTooltip = ({ active, payload }: RateTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const { point } = row;

  return (
    <div className="rounded-lg border border-ink-200 bg-card px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-ink-700">{row.label}</div>
      {point.rate === null ? (
        <p className="text-xs text-ink-500">ไม่มีข้อมูลรายจ่ายของเดือนนี้</p>
      ) : (
        <ul className="space-y-0.5">
          <li className="flex items-center justify-between gap-4 text-xs text-ink-700">
            <span>รายได้สุทธิ</span>
            <span className="font-semibold tabular-nums text-income-ink">
              {formatTHB(point.netAll)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4 text-xs text-ink-700">
            <span>จ่าย</span>
            <span className="font-semibold tabular-nums text-expense-ink">
              {formatTHB(point.spent)}
            </span>
          </li>
          <li className="mt-1 flex items-center justify-between gap-4 border-t border-ink-200 pt-1 text-xs">
            <span className="font-semibold text-ink-600">เหลือ</span>
            <span className="font-semibold tabular-nums text-ink-900">
              {formatTHB(point.kept)} ({formatPercent(point.rate)})
            </span>
          </li>
        </ul>
      )}
      {row.avgPct !== null && (
        <p className="mt-1.5 text-[11px] text-ink-500">
          เฉลี่ย 3 เดือน {formatPercent(row.avgPct / 100)}
        </p>
      )}
    </div>
  );
};

export interface SavingsRateChartProps {
  points: readonly SavingsRatePoint[];
  height?: number;
}

export const SavingsRateChart = ({ points, height = 320 }: SavingsRateChartProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  const anim = chartAnimation(reduced);
  const chart = useChartTheme();

  const rows = useMemo<Row[]>(() => {
    const avg = rollingAverage(points, AVERAGE_WINDOW);
    return points.map((point, idx) => ({
      ym: point.ym,
      label: labelOf(point.ym),
      // null คงเป็น null — ห้ามแทนที่ด้วย 0
      ratePct: point.rate === null ? null : point.rate * 100,
      avgPct: avg[idx] === null ? null : (avg[idx] as number) * 100,
      point,
    }));
  }, [points]);

  /**
   * เดือนที่ไม่มีอัตราการออม มีสองสาเหตุ และมันไม่เหมือนกัน — ป้ายจึงต้องแยก:
   *   • ไม่มีรายได้ (netAll = 0) → เดือนที่ยังไม่ถึง/ยังไม่กรอก เช่น ก.ค. 2026
   *   • มีรายได้ แต่ไม่มีรายการรายจ่าย → ปี 2023 ทั้งปีของ Tom
   * เขียนรวมเป็น "ไม่มีข้อมูลรายจ่าย" ก้อนเดียวก็จะโกหกเดือนแรก
   */
  const missing = useMemo(() => points.filter((p) => p.rate === null), [points]);
  const noExpenseData = useMemo(() => missing.filter((p) => p.netAll !== 0), [missing]);
  const noIncome = useMemo(() => missing.filter((p) => p.netAll === 0), [missing]);
  const noExpenseYears = useMemo(() => {
    const years = new Set(noExpenseData.map((p) => parseYm(p.ym).year));
    return [...years].sort((a, b) => a - b);
  }, [noExpenseData]);

  const hasAny = rows.some((r) => r.ratePct !== null);

  return (
    <section className="rounded-2xl border border-ink-200 bg-card p-4 shadow-sm md:p-6">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">อัตราการออม</h2>
        <p className="text-xs text-ink-500">
          เก็บได้กี่ % ของรายได้สุทธิเดือนนั้น · เส้นม่วง = เฉลี่ย 3 เดือน
        </p>
      </header>

      {hasAny ? (
        <div className={CHART_BOX} style={chartBoxStyle(height)}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis
                dataKey="ym"
                tickFormatter={labelOf}
                stroke={chart.axisTick}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: chart.axisLine }}
                /* ดู NetWorthHistoryChart — ป้ายเดือนต้องไม่ทับกันบนมือถือ */
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                stroke={chart.axisTick}
                tick={{ fontSize: 12 }}
                tickFormatter={yTickFormatter}
                tickLine={false}
                axisLine={{ stroke: chart.axisLine }}
                width={56}
              />
              <Tooltip content={<RateTooltip />} cursor={{ fill: chart.cursorFill }} />
              <ReferenceLine y={0} stroke={chart.axisLine} />
              <Bar dataKey="ratePct" radius={[3, 3, 0, 0]} {...anim}>
                {rows.map((row) => (
                  <Cell
                    key={row.ym}
                    fill={(row.ratePct ?? 0) < 0 ? COLOR_NEGATIVE : COLOR_POSITIVE}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="avgPct"
                stroke={COLOR_AVERAGE}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                {...anim}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className={`flex items-center justify-center text-sm text-ink-400 ${CHART_BOX}`}
          style={chartBoxStyle(height)}
          role="status"
        >
          ยังไม่มีข้อมูลพอจะคิดอัตราการออม
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-ink-200 pt-3 text-xs text-ink-500">
          {noExpenseData.length > 0 && (
            <p>
              {noExpenseData.length} เดือนไม่มีข้อมูลรายจ่าย (ปี {noExpenseYears.join(', ')})
              จึงไม่มีอัตราการออม
            </p>
          )}
          {noIncome.length > 0 && (
            <p>
              {noIncome.length} เดือนยังไม่มีรายได้ ({labelOf(noIncome[0].ym)}
              {noIncome.length > 1 ? ` – ${labelOf(noIncome[noIncome.length - 1].ym)}` : ''})
              จึงยังคิดอัตราไม่ได้
            </p>
          )}
          <p>ช่องว่างในกราฟคือ &ldquo;ไม่รู้&rdquo; ไม่ใช่ &ldquo;ศูนย์&rdquo;</p>
        </div>
      )}
    </section>
  );
};

export default SavingsRateChart;
