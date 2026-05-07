/**
 * Settings page — Data Sync section (F10_SYNC).
 *
 * Surfaces the live sync status from `useSyncStore`, plus two buttons that
 * delegate to the coordinator hook mounted in the app shell:
 *   • Sync Now            → `manualSync` (force-push local → Drive)
 *   • Restore from Drive  → `manualReload` (force-pull Drive → local),
 *                           guarded by a confirm dialog because it replaces
 *                           data in place.
 *
 * Three states for the section body:
 *   1. Auth not configured (no VITE_GOOGLE_CLIENT_ID)
 *   2. Configured but not signed in
 *   3. Signed in — show timestamp + buttons
 */

import { useState, type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';
import { useSyncCoordinator } from '@/auth/syncCoordinator';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import BackupSection from '@/components/settings/BackupSection';
import DangerZone from '@/components/settings/DangerZone';
import IncomeDefaultsSection from '@/components/settings/IncomeDefaultsSection';
import ReportsSection from '@/components/settings/ReportsSection';
import { useSyncStore, type SyncStatus } from '@/stores/syncStore';
import { formatRelativeTime, formatThaiDate } from '@/utils/formatters';

const STATUS_LABEL: Record<SyncStatus, { icon: string; label: string; tone: string }> = {
  idle: { icon: '○', label: 'ไม่ได้ซิงค์', tone: 'text-slate-500' },
  syncing: { icon: '↻', label: 'กำลังซิงค์...', tone: 'text-primary' },
  synced: { icon: '✓', label: 'ซิงค์แล้ว', tone: 'text-income' },
  offline: { icon: '○', label: 'ออฟไลน์', tone: 'text-slate-500' },
  error: { icon: '!', label: 'ซิงค์ผิดพลาด', tone: 'text-expense' },
};

const RESTORE_CONFIRM =
  'ยืนยันการดึงข้อมูลจาก Google Drive? ข้อมูลในเครื่องจะถูกแทนที่';

const formatTimestamp = (iso: string | null): string => {
  if (!iso) return 'ยังไม่เคยซิงค์';
  try {
    const relative = formatRelativeTime(iso);
    const absolute = formatThaiDate(iso);
    return `${relative} (${absolute})`;
  } catch {
    return 'ยังไม่เคย sync';
  }
};

export const SettingsPage = (): ReactNode => {
  const { isReady, isSignedIn, user } = useGoogleAuth();
  const { manualSync, manualReload } = useSyncCoordinator();

  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const errorMessage = useSyncStore((s) => s.errorMessage);

  const [busy, setBusy] = useState<null | 'sync' | 'reload'>(null);

  const onSync = async (): Promise<void> => {
    setBusy('sync');
    try {
      await manualSync();
    } finally {
      setBusy(null);
    }
  };

  const onReload = async (): Promise<void> => {
    if (!window.confirm(RESTORE_CONFIRM)) return;
    setBusy('reload');
    try {
      await manualReload();
    } finally {
      setBusy(null);
    }
  };

  const statusInfo = STATUS_LABEL[status];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">ตั้งค่า</h1>

      <section
        aria-labelledby="settings-data-sync"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <header>
          <h2
            id="settings-data-sync"
            className="text-lg font-semibold text-slate-900"
          >
            ซิงค์ข้อมูล
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            ข้อมูลจะถูกซิงค์กับ Google Drive ของคุณโดยอัตโนมัติ —
            แอปไม่เก็บข้อมูลไว้บน server กลาง
          </p>
        </header>

        {!isReady ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <div className="font-medium text-slate-700">Drive Sync ปิดอยู่</div>
            <p className="mt-1 text-xs text-slate-500">
              ตั้งค่า <code className="px-1 py-0.5 bg-white border rounded">VITE_GOOGLE_CLIENT_ID</code>
              {' '}ใน <code className="px-1 py-0.5 bg-white border rounded">.env.local</code>
              {' '}เพื่อเปิดใช้งานการซิงค์กับ Google Drive
            </p>
          </div>
        ) : !isSignedIn ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600">
              ยังไม่ได้เข้าสู่ระบบ Google
            </p>
            <GoogleSignInButton />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">สถานะ:</span>
                <span className={`font-medium ${statusInfo.tone}`}>
                  <span aria-hidden="true" className="mr-1">{statusInfo.icon}</span>
                  {statusInfo.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span>ซิงค์ล่าสุด:</span>
                <span className="font-medium text-slate-700 tabular-nums">
                  {formatTimestamp(lastSyncedAt)}
                </span>
              </div>
              {user ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <span>บัญชี:</span>
                  <span className="font-medium text-slate-700">{user.email}</span>
                </div>
              ) : null}
              {status === 'error' && errorMessage ? (
                <div className="mt-1 text-xs text-expense">{errorMessage}</div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={onSync}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
              >
                {busy === 'sync' ? 'กำลังซิงค์...' : 'ซิงค์ตอนนี้'}
              </button>
              <button
                type="button"
                onClick={onReload}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
              >
                {busy === 'reload' ? 'กำลังคืนค่า...' : 'คืนค่าจาก Drive'}
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              <span aria-hidden="true">⚠️ </span>
              คืนค่าจาก Drive จะแทนที่ข้อมูลในเครื่องด้วยข้อมูลล่าสุดจาก
              Google Drive ทั้งหมด
            </p>
          </>
        )}
      </section>

      <IncomeDefaultsSection />

      <BackupSection />

      <ReportsSection />

      <DangerZone />
    </div>
  );
};

export default SettingsPage;
