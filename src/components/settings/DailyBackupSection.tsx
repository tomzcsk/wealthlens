/**
 * Settings — Daily Backup (Drive) section.
 *
 * Lists per-day snapshot files from Drive's WealthLens/backups/ folder and
 * lets Tom restore any of them in one click.  Restore flow (read-before-write
 * — restoring TODAY's own file must read it before the undo snapshot
 * overwrites it):
 *   1. Download the chosen file and run it through validateBackup (same path
 *      as manual Import) — reject on schema error without writing anything.
 *   2. Save today's state as an undo snapshot (so Tom can roll back).
 *   3. replaceAllData → store + LocalStorage updated.
 *   4. Refresh the list so the newly-written today file shows updated size.
 *
 * Auth: section shows a sign-in prompt when not authenticated; load is lazy
 * (button-triggered) so we never hit Drive on pages that don't need it.
 */

import { useState, type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import {
  BACKUP_RETENTION_DAYS,
  downloadBackup,
  listBackups,
  writeBackupSnapshot,
  type BackupFileInfo,
} from '@/utils/driveBackup';
import { validateBackup } from '@/utils/exportImport';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const DailyBackupSection = (): ReactNode => {
  const { isSignedIn, accessToken } = useGoogleAuth();
  const replaceAllData = useFinanceStore((s) => s.replaceAllData);
  const pushToast = useToastStore((s) => s.push);

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadList = async (): Promise<void> => {
    if (!accessToken) return;
    setLoadState('loading');
    try {
      setBackups(await listBackups(accessToken));
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  };

  const restoreFrom = async (file: BackupFileInfo): Promise<void> => {
    if (!accessToken) return;
    setRestoringId(file.fileId);
    try {
      // 1) ดาวน์โหลด + ตรวจไฟล์เป้าหมายให้ผ่านก่อน แล้วค่อยเขียน undo snapshot
      //    ทับไฟล์วันนี้ — ลำดับนี้สำคัญ: ถ้ากู้ไฟล์ของวันนี้เอง
      //    ต้องอ่านมันมาก่อนถูกทับ (validate ผ่านเส้นทางเดียวกับ Import ไฟล์มือ)
      const raw = await downloadBackup(accessToken, file.fileId);
      const result = validateBackup(JSON.parse(raw) as unknown);
      if (!result.ok) {
        // ยังไม่มีอะไรถูกเขียนเลย — ทั้ง Drive และข้อมูลปัจจุบันอยู่ครบ
        pushToast({
          tone: 'error',
          message: `ไฟล์ backup ${file.date} ไม่ผ่านการตรวจสอบ — ข้อมูลปัจจุบันไม่ถูกแตะ`,
        });
        return;
      }
      // 2) Undo path: เก็บสภาพปัจจุบันเป็นไฟล์ของวันนี้ ก่อน replace
      await writeBackupSnapshot(accessToken, useFinanceStore.getState().data);
      replaceAllData(result.data);
      pushToast({
        tone: 'success',
        message: `กู้ข้อมูลจาก ${file.date} แล้ว — เปลี่ยนใจกู้กลับได้จากไฟล์ของวันนี้`,
      });
      void loadList(); // ไฟล์วันนี้เพิ่งถูกเขียนทับ — refresh ขนาด/รายการ
    } catch {
      pushToast({
        tone: 'error',
        message: 'กู้ข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง ข้อมูลปัจจุบันไม่ถูกแตะ',
      });
    } finally {
      setRestoringId(null);
      setConfirmingId(null);
    }
  };

  return (
    <section
      aria-labelledby="settings-daily-backup"
      className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-4"
    >
      <header>
        <h2
          id="settings-daily-backup"
          className="text-lg font-semibold text-ink-900"
        >
          🗓️ Backup รายวัน (Drive)
        </h2>
        <p className="text-sm text-ink-500 mt-1">
          ระบบถ่ายสำเนาข้อมูลขึ้น Drive วันละไฟล์อัตโนมัติ เก็บย้อนหลัง{' '}
          {BACKUP_RETENTION_DAYS} วัน — กู้กลับเป็นข้อมูลของวันไหนก็ได้
        </p>
      </header>

      {!isSignedIn ? (
        <p className="text-sm text-ink-500">
          ต้อง sign in Google ก่อน จึงจะดูและกู้ backup รายวันได้
        </p>
      ) : loadState === 'idle' ? (
        <button
          type="button"
          onClick={() => void loadList()}
          className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-hover"
        >
          โหลดรายการ backup
        </button>
      ) : loadState === 'loading' ? (
        <p className="text-sm text-ink-500">กำลังโหลดรายการ…</p>
      ) : loadState === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-expense-ink">โหลดรายการไม่สำเร็จ</p>
          <button
            type="button"
            onClick={() => void loadList()}
            className="text-sm text-primary-ink hover:underline"
          >
            ลองใหม่
          </button>
        </div>
      ) : backups.length === 0 ? (
        <p className="text-sm text-ink-500">
          ยังไม่มีไฟล์ backup — ไฟล์แรกจะถูกสร้างหลัง sync สำเร็จครั้งแรกของวัน
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {backups.map((b) => (
            <li
              key={b.fileId}
              className="flex items-center justify-between py-2 gap-3"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-ink-700 tabular-nums">
                  {b.date}
                </span>
                <span className="text-xs text-ink-400 tabular-nums">
                  {formatSize(b.sizeBytes)}
                </span>
              </div>
              {confirmingId === b.fileId ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-600">
                    แทนที่ข้อมูลปัจจุบันด้วยข้อมูลของ {b.date}?
                  </span>
                  <button
                    type="button"
                    disabled={restoringId !== null}
                    onClick={() => void restoreFrom(b)}
                    className="rounded-lg bg-expense px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {restoringId === b.fileId ? 'กำลังกู้…' : 'ยืนยันกู้'}
                  </button>
                  <button
                    type="button"
                    disabled={restoringId !== null}
                    onClick={() => setConfirmingId(null)}
                    className="text-xs text-ink-500 hover:underline"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={restoringId !== null}
                  onClick={() => setConfirmingId(b.fileId)}
                  className="rounded-lg border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-hover disabled:opacity-50"
                >
                  กู้คืน
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default DailyBackupSection;
