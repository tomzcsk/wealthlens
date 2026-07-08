/**
 * WealthLens — build metadata footer (sidebar bottom-left).
 * Shows `v<version> · #<git hash>` and the build date/time in Thai (พ.ศ.).
 * Values are injected at build time by Vite `define` (see vite.config.ts).
 */
import type { ReactNode } from 'react';

import { THAI_MONTHS_SHORT } from '@/utils/formatters';

const buildDate = new Date(__BUILD_TIME__);

/** "8 ก.ค. 2569 16:25" — Thai short month + Buddhist-era year + 24h time. */
const formatBuildStamp = (d: Date): string => {
  if (!Number.isFinite(d.getTime())) return '';
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  const yearBE = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${yearBE} ${hh}:${mm}`;
};

export const BuildInfo = (): ReactNode => (
  <div className="mt-auto px-4 py-4 border-t border-slate-100 text-[11px] leading-relaxed text-slate-400 select-none">
    <div className="tabular-nums">
      v{__APP_VERSION__} · #{__GIT_COMMIT__}
    </div>
    <div className="tabular-nums">{formatBuildStamp(buildDate)}</div>
  </div>
);

export default BuildInfo;
