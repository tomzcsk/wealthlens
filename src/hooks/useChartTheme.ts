/** WealthLens — สีกราฟตามโหมดที่กำลังแสดงอยู่ (F46). */
import { chartPalette, type ChartPalette } from '@/lib/chartTheme';
import { useThemeStore } from '@/stores/themeStore';

export const useChartTheme = (): ChartPalette =>
  chartPalette(useThemeStore((s) => s.resolved));

export default useChartTheme;
