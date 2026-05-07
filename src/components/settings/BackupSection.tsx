/**
 * Settings — Backup & Restore section (F13).
 *
 * Self-contained card that drops into SettingsPage. Two operations:
 *   • Export — download all data as a date-stamped JSON file.
 *   • Import — restore from a JSON file via picker OR drag-and-drop, with
 *              user-selectable mode: Replace (overwrite all) | Merge
 *              (last-write-wins per year, preserves untouched years).
 *
 * UX guarantees:
 *   - Replace requires explicit confirm() — destructive action gate.
 *   - Validation errors render in a collapsible <details> so users can see
 *     exactly which records failed without flooding the UI.
 *   - Status pill auto-clears after 5s so the section never feels stale.
 *   - Drag-and-drop highlights the card; only the FIRST .json file is read.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import {
  downloadBackup,
  importFromFile,
  mergeData,
  type ValidationResult,
} from '@/utils/exportImport';

type ImportMode = 'replace' | 'merge';

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; errors?: string[] };

const STATUS_TIMEOUT_MS = 5000;
const REPLACE_CONFIRM =
  'ยืนยัน Replace ข้อมูลทั้งหมดด้วยไฟล์ที่ import?';

export const BackupSection = (): ReactNode => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);

  // Auto-clear status pill after 5s so it never feels stuck.
  useEffect(() => {
    if (status.kind === 'idle') return;
    const t = window.setTimeout(
      () => setStatus({ kind: 'idle' }),
      STATUS_TIMEOUT_MS,
    );
    return () => window.clearTimeout(t);
  }, [status]);

  const pushToast = useToastStore((s) => s.push);

  // -- Export -------------------------------------------------------------
  const handleExport = (): void => {
    try {
      const data = useFinanceStore.getState().data;
      downloadBackup(data);
      pushToast({ tone: 'success', message: 'ส่งออกสำเร็จ' });
      setStatus({ kind: 'success', message: 'ส่งออกไฟล์ backup แล้ว' });
    } catch (e) {
      const msg = (e as Error).message ?? 'ส่งออกล้มเหลว';
      pushToast({ tone: 'error', message: `ส่งออกล้มเหลว: ${msg}` });
      setStatus({ kind: 'error', message: msg });
    }
  };

  // -- Import -------------------------------------------------------------
  const applyImport = (result: ValidationResult): void => {
    if (!result.ok) {
      pushToast({ tone: 'error', message: 'ไฟล์ backup ไม่ถูกต้อง' });
      setStatus({
        kind: 'error',
        message: 'ไฟล์ backup ไม่ถูกต้อง',
        errors: result.errors,
      });
      return;
    }

    if (mode === 'replace') {
      if (!window.confirm(REPLACE_CONFIRM)) {
        setStatus({ kind: 'idle' });
        return;
      }
      useFinanceStore.getState().replaceAllData(result.data);
      pushToast({ tone: 'success', message: 'แทนที่ข้อมูลจาก backup แล้ว' });
      setStatus({ kind: 'success', message: 'แทนที่ข้อมูลทั้งหมดแล้ว' });
    } else {
      const current = useFinanceStore.getState().data;
      const merged = mergeData(current, result.data);
      useFinanceStore.getState().replaceAllData(merged);
      pushToast({
        tone: 'success',
        message: 'รวม backup กับข้อมูลปัจจุบันแล้ว',
      });
      setStatus({ kind: 'success', message: 'รวม backup แล้ว' });
    }
  };

  const handleFile = async (file: File): Promise<void> => {
    const result = await importFromFile(file);
    applyImport(result);
  };

  const onPickerChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so picking the same file twice still triggers change.
    e.target.value = '';
  };

  const onClickImport = (): void => {
    fileInputRef.current?.click();
  };

  // -- Drag & drop --------------------------------------------------------
  const onDragOver = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const jsonFile = files.find(
      (f) => f.type === 'application/json' || f.name.toLowerCase().endsWith('.json'),
    );
    if (!jsonFile) {
      pushToast({ tone: 'error', message: 'กรุณาวางไฟล์ .json เพื่อ import' });
      return;
    }
    void handleFile(jsonFile);
  };

  // -- Render -------------------------------------------------------------
  return (
    <section
      aria-labelledby="settings-backup"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-white rounded-2xl border shadow-sm p-6 space-y-4 transition-colors ${
        isDragOver
          ? 'border-primary bg-primary-light'
          : 'border-slate-200'
      }`}
    >
      <header>
        <h2
          id="settings-backup"
          className="text-lg font-semibold text-slate-900"
        >
          Backup / คืนค่า
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          ส่งออกข้อมูลทั้งหมดเป็นไฟล์ JSON หรือ restore กลับจากไฟล์ backup —
          ทำงานในเครื่อง ไม่ผ่าน server
        </p>
      </header>

      {/* Export */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Export — ดาวน์โหลดข้อมูลทั้งหมดเป็น JSON
        </h3>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
          <span aria-hidden="true">📥</span>
          Export Backup
        </button>
        <p className="text-xs text-slate-500">
          ดาวน์โหลดเป็น{' '}
          <code className="px-1 py-0.5 bg-slate-50 border border-slate-200 rounded">
            wealthlens_backup_YYYY-MM-DD.json
          </code>
        </p>
      </div>

      <hr className="border-slate-200" />

      {/* Import */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Import — คืนค่าจากไฟล์ JSON
        </h3>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={onClickImport}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <span aria-hidden="true">📤</span>
            Import Backup
          </button>
          <span className="text-xs text-slate-500">
            หรือลากไฟล์ <code className="px-1 py-0.5 bg-slate-50 border border-slate-200 rounded">.json</code> มาวางที่นี่
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onPickerChange}
            className="hidden"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            โหมด
          </legend>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                className="accent-primary"
              />
              แทนที่ข้อมูลทั้งหมด
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
                className="accent-primary"
              />
              รวม (ปีล่าสุดทับปีเดิม)
            </label>
          </div>
        </fieldset>

        {mode === 'replace' ? (
          <p className="text-sm font-medium text-expense bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span aria-hidden="true">⚠️ </span>
            Replace all จะเขียนทับข้อมูลทั้งหมดและแทนที่ด้วยไฟล์ที่ import
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            รวม: ปีที่อยู่ในไฟล์ import จะถูกแทนที่ทั้งปี ส่วนปีอื่นๆ ในเครื่องยังอยู่ครบ
          </p>
        )}
      </div>

      {/* Status pill + error details */}
      {status.kind !== 'idle' ? (
        <div className="space-y-2">
          <div
            role="status"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              status.kind === 'success'
                ? 'bg-emerald-50 text-income border border-emerald-200'
                : 'bg-red-50 text-expense border border-red-200'
            }`}
          >
            <span aria-hidden="true">
              {status.kind === 'success' ? '✓' : '!'}
            </span>
            {status.message}
          </div>
          {status.kind === 'error' && status.errors && status.errors.length > 0 ? (
            <details className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <summary className="cursor-pointer font-medium text-slate-700">
                ดูรายละเอียด ({status.errors.length} ข้อผิดพลาด)
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed list-disc list-inside">
                {status.errors.slice(0, 50).map((err, idx) => (
                  <li key={idx} className="break-all">
                    {err}
                  </li>
                ))}
                {status.errors.length > 50 ? (
                  <li className="italic text-slate-500">
                    …และอีก {status.errors.length - 50} ข้อผิดพลาด
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default BackupSection;
