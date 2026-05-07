/**
 * WealthLens — Drive sync status badge.
 *
 * Subscribes to `useSyncStore` and renders one of:
 *   ✅ Synced       (green, with last-synced relative time on hover)
 *   🔄 Syncing...   (blue, animated spinner)
 *   📴 Offline      (slate)
 *   ⚠️ Sync Error   (red, click to retry)
 *
 * "Idle" hides the badge entirely so it doesn't visually nag the user before
 * they've signed in. The retry callback is optional — when omitted, an error
 * badge is purely informational.
 */

import { type ReactNode } from 'react';

import { useSyncStore, type SyncStatus } from '@/stores/syncStore';

export interface SyncStatusIndicatorProps {
  /** Called when the user clicks an error badge to retry. */
  onRetry?: () => void;
}

interface BadgeConfig {
  icon: string;
  label: string;
  className: string;
}

const BADGES: Record<Exclude<SyncStatus, 'idle'>, BadgeConfig> = {
  synced: {
    icon: '✓',
    label: 'ซิงค์แล้ว',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  syncing: {
    icon: '↻',
    label: 'กำลังซิงค์...',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  offline: {
    icon: '○',
    label: 'ออฟไลน์',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  error: {
    icon: '!',
    label: 'ซิงค์ผิดพลาด',
    className:
      'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 cursor-pointer',
  },
};

const formatLastSynced = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'เมื่อสักครู่';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} นาทีก่อน`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ชม.ก่อน`;
  return new Date(ms).toLocaleDateString();
};

export const SyncStatusIndicator = ({
  onRetry,
}: SyncStatusIndicatorProps): ReactNode => {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const errorMessage = useSyncStore((s) => s.errorMessage);

  if (status === 'idle') return null;

  const badge = BADGES[status];
  const isError = status === 'error';

  const tooltip = isError
    ? (errorMessage ?? 'ซิงค์ผิดพลาด — แตะเพื่อลองใหม่')
    : status === 'synced'
      ? `ซิงค์แล้ว ${formatLastSynced(lastSyncedAt)}`
      : badge.label;

  const className = `inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium select-none ${badge.className}`;
  const iconClassName =
    status === 'syncing' ? 'inline-block animate-spin' : 'inline-block';

  const inner = (
    <>
      <span aria-hidden="true" className={iconClassName}>
        {badge.icon}
      </span>
      <span>{badge.label}</span>
    </>
  );

  if (isError && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={tooltip}
        className={className}
        aria-live="polite"
      >
        {inner}
      </button>
    );
  }

  return (
    <span title={tooltip} className={className} aria-live="polite">
      {inner}
    </span>
  );
};

export default SyncStatusIndicator;
