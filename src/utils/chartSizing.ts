/**
 * WealthLens — responsive chart box (F47).
 *
 * Every Recharts `<ResponsiveContainer>` needs a parent with a *resolved*
 * height (it collapses to 0 otherwise), which is why each chart section
 * carries a fixed pixel height. On a phone those desktop heights turn the
 * page into a mile of scrolling, so the box is ~20% shorter below `md:` and
 * pixel-identical from `md:` up.
 *
 * The height is a prop, and Tailwind can't read runtime values — so the prop
 * travels as a CSS custom property and the class does the arithmetic. One
 * source of truth for the shrink factor, and desktop stays exactly where it
 * was.
 */
import type { CSSProperties } from 'react';

/** Wrapper class for a chart (or its empty state). Pair with `chartBoxStyle`. */
export const CHART_BOX = 'w-full h-[calc(var(--chart-h)*0.8)] md:h-[var(--chart-h)]';

/** Feeds the desktop height into `CHART_BOX`. */
export const chartBoxStyle = (height: number): CSSProperties =>
  ({ '--chart-h': `${height}px` }) as CSSProperties;
