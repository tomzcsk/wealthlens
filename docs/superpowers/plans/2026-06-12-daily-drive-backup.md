# Daily Drive Backup Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** snapshot ข้อมูลทั้งก้อนขึ้น `WealthLens/backups/` วันละไฟล์อัตโนมัติ + retention 30 วัน + restore UI ใน Settings

**Architecture:** module ใหม่ `driveBackup.ts` (write-only ต่อโฟลเดอร์ backups — ห้ามแตะไฟล์หลัก/LocalStorage) reuse helper จาก `driveSync.ts` ที่ต้อง export เพิ่ม trigger คือ Effect ใหม่ใน `useDriveSyncCoordinator` ที่ฟัง `useSyncStore` เปลี่ยนเป็น `'synced'` → `maybeWriteDailySnapshot` (best-effort, เงียบ, cache วันที่ per-user ใน LocalStorage) Restore ใช้เส้นทาง `validateBackup` + `replaceAllData` เดิม

**Tech Stack:** React 18 + TypeScript strict + Zustand + Drive REST v3 ผ่าน fetch (scope `drive.file` เดิม — ห้ามขยาย)

**Spec:** `docs/superpowers/specs/2026-06-12-daily-drive-backup-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/utils/driveSync.ts` | Modify | export helper ที่ private อยู่: `driveFetch`, `escapeQuery`, `buildMultipartBody`, `DRIVE_API`, `DRIVE_UPLOAD`, `JSON_MIME`, `FOLDER_MIME` (additive เท่านั้น) |
| `src/utils/driveBackup.ts` | Create | pure helpers + Drive functions + `maybeWriteDailySnapshot` |
| `scripts/verify-drive-backup.ts` | Create | assertion เคสวันที่/retention (no test runner — pattern เดิม) |
| `src/hooks/useDriveSyncCoordinator.ts` | Modify | Effect D — fire snapshot เมื่อ status → 'synced' |
| `src/components/settings/DailyBackupSection.tsx` | Create | list + restore UI |
| `src/pages/SettingsPage.tsx` | Modify | render section ใหม่ใต้ `<BackupSection />` |
| `features.json` | Modify | F28 |

ข้อเท็จจริงของ codebase ที่ implementer ต้องรู้:
- `useSyncStore.setLastSynced()` เป็นตัว set `status: 'synced'` หลัง `flushPendingSync` สำเร็จ
- `useGoogleAuth()` คืน `{ isSignedIn, accessToken, isReady, user, signOut }` — `user.email` คือ identity (มี `GoogleUser { email }` ใน `src/auth/useGoogleAuth.ts`; ตรวจชื่อ field จริงก่อนใช้)
- `BackupSection.tsx` มี pattern toast + confirm อยู่แล้ว — อ่านก่อนเขียน UI แล้วใช้ API เดียวกัน (ถ้า toast API ต่างจากโค้ดใน plan ให้ตามของจริง)

---

### Task 1: Export Drive helpers

**Files:**
- Modify: `src/utils/driveSync.ts`

- [ ] **Step 1.1:** เปลี่ยน declarations เหล่านี้จาก private เป็น `export` (ห้ามแก้ body):
  - `const FOLDER_MIME`, `const JSON_MIME`, `const DRIVE_API`, `const DRIVE_UPLOAD` (บรรทัด ~29-32)
  - `const escapeQuery` (~183)
  - `const driveFetch` (~151) และ interface `DriveFetchOptions` (~144)
  - `const buildMultipartBody` (~235)

  เพิ่ม comment หนึ่งบรรทัดเหนือกลุ่ม export ใหม่: `// Exported for driveBackup.ts — daily snapshots reuse the same plumbing.`

- [ ] **Step 1.2:** `npm run typecheck && npm run lint` → clean

- [ ] **Step 1.3:** Commit
```bash
git add src/utils/driveSync.ts
git commit -m "refactor(drive): export fetch/query helpers ให้ driveBackup ใช้ร่วม

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `driveBackup.ts` — pure helpers + verification script

**Files:**
- Create: `src/utils/driveBackup.ts` (ส่วนแรก)
- Create: `scripts/verify-drive-backup.ts`

- [ ] **Step 2.1:** สร้าง `src/utils/driveBackup.ts`:

```ts
/**
 * WealthLens — daily backup snapshots on Google Drive.
 *
 * เขียนสำเนาข้อมูลทั้งก้อนเป็นไฟล์รายวันที่ WealthLens/backups/
 * (wealthlens_backup_YYYY-MM-DD.json, local date) + ลบไฟล์เก่ากว่า
 * 30 วัน
 *
 * Safety invariant: โมดูลนี้ write-only ต่อโฟลเดอร์ backups เท่านั้น —
 * ห้ามมีโค้ดเส้นไหนเขียน wealthlens_data.json หลักหรือ LocalStorage
 * ของ finance store การ restore เป็น action ที่ผู้ใช้กดเองผ่าน
 * validateBackup + replaceAllData (เส้นทางเดียวกับ Import ไฟล์มือ)
 */
import type { WealthLensData } from '@/types';
import {
  DRIVE_API,
  DRIVE_UPLOAD,
  FOLDER_MIME,
  JSON_MIME,
  buildMultipartBody,
  driveFetch,
  escapeQuery,
  findOrCreateFolder,
  retryWithBackoff,
} from './driveSync';

export const BACKUP_FOLDER = 'backups';
export const BACKUP_PREFIX = 'wealthlens_backup_';
export const BACKUP_RETENTION_DAYS = 30;
const SNAPSHOT_DATE_KEY_PREFIX = 'wealthlens_last_snapshot_date_';

export interface BackupFileInfo {
  fileId: string;
  /** YYYY-MM-DD จากชื่อไฟล์. */
  date: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (covered by scripts/verify-drive-backup.ts)
// ---------------------------------------------------------------------------

/** วันที่แบบ local ของเครื่อง (วันแบบที่ผู้ใช้เห็น ไม่ใช่ UTC). */
export const localDateString = (d: Date = new Date()): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const backupFilenameForDate = (date: string): string =>
  `${BACKUP_PREFIX}${date}.json`;

/** คืน YYYY-MM-DD จากชื่อไฟล์ snapshot หรือ null ถ้าไม่ใช่รูปแบบที่รู้จัก. */
export const parseBackupDate = (filename: string): string | null => {
  const m = filename.match(/^wealthlens_backup_(\d{4}-\d{2}-\d{2})\.json$/);
  return m ? m[1] : null;
};

/**
 * ไฟล์ที่อายุเกิน retention — "เก็บ 30 วัน" หมายถึงไฟล์ของวันนี้ย้อนไป
 * 29 วันยังอยู่ ไฟล์ที่เก่ากว่านั้นถูกคัดทิ้ง (YYYY-MM-DD เทียบ string ได้ตรงๆ).
 */
export const selectExpiredBackups = (
  files: BackupFileInfo[],
  today: string,
  retentionDays: number = BACKUP_RETENTION_DAYS,
): BackupFileInfo[] => {
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  const cutoffStr = localDateString(cutoff);
  return files.filter((f) => f.date < cutoffStr);
};
```

- [ ] **Step 2.2:** สร้าง `scripts/verify-drive-backup.ts`:

```ts
/**
 * Hand-computed verification for driveBackup pure helpers.
 * Run: npx tsx scripts/verify-drive-backup.ts
 */
import {
  backupFilenameForDate,
  parseBackupDate,
  selectExpiredBackups,
  type BackupFileInfo,
} from '../src/utils/driveBackup';

let failures = 0;
const expect = (label: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`✅ ${label}`);
  else {
    failures++;
    console.error(`❌ ${label}: expected ${e}, got ${a}`);
  }
};

expect('filename', backupFilenameForDate('2026-06-12'), 'wealthlens_backup_2026-06-12.json');
expect('parse roundtrip', parseBackupDate('wealthlens_backup_2026-06-12.json'), '2026-06-12');
expect('parse rejects foreign file', parseBackupDate('wealthlens_data.json'), null);
expect('parse rejects bad date shape', parseBackupDate('wealthlens_backup_2026-6-2.json'), null);

const mk = (date: string): BackupFileInfo => ({ fileId: `id-${date}`, date, sizeBytes: 1 });

// วันนี้ 2026-06-12, retention 30 → เก็บ 2026-05-14..2026-06-12, ทิ้ง ≤ 2026-05-13
const files = [
  mk('2026-06-12'),
  mk('2026-05-14'), // วันสุดท้ายที่ยังเก็บ
  mk('2026-05-13'), // หมดอายุพอดี
  mk('2026-04-01'),
];
expect(
  'retention 30 days cutoff',
  selectExpiredBackups(files, '2026-06-12').map((f) => f.date),
  ['2026-05-13', '2026-04-01'],
);

// ข้ามเดือน/ปี: วันนี้ 2026-01-15, retention 30 → cutoff 2025-12-17
expect(
  'cross-year cutoff',
  selectExpiredBackups([mk('2025-12-17'), mk('2025-12-16')], '2026-01-15').map((f) => f.date),
  ['2025-12-16'],
);

expect('empty list', selectExpiredBackups([], '2026-06-12'), []);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\n🎉 all drive-backup helper checks passed');
```

- [ ] **Step 2.3:** Run `npx tsx scripts/verify-drive-backup.ts` → `🎉 all drive-backup helper checks passed`

- [ ] **Step 2.4:** `npm run typecheck && npm run lint` → clean (unused imports ใน driveBackup.ts ที่ Drive functions จะใช้ใน Task 3 — ถ้า lint ฟ้อง ให้เพิ่ม Drive functions ใน Task 3 ก่อน commit รวม หรือคอมเมนต์ import ที่ยังไม่ใช้ออกชั่วคราวแล้วใส่กลับใน Task 3; เลือกทางที่ lint ผ่านจริง)

- [ ] **Step 2.5:** Commit
```bash
git add src/utils/driveBackup.ts scripts/verify-drive-backup.ts
git commit -m "feat(backup): driveBackup pure helpers + verification script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `driveBackup.ts` — Drive functions + orchestrator

**Files:**
- Modify: `src/utils/driveBackup.ts` (ต่อท้าย)

- [ ] **Step 3.1:** ต่อท้ายไฟล์:

```ts
// ---------------------------------------------------------------------------
// Drive plumbing
// ---------------------------------------------------------------------------

interface DriveFileEntry {
  id: string;
  name: string;
  /** Drive ส่ง size เป็น string. */
  size?: string;
}

interface DriveListResponse {
  files?: DriveFileEntry[];
}

/** หา/สร้างโฟลเดอร์ backups ใต้โฟลเดอร์ WealthLens หลัก. */
const findOrCreateBackupFolder = async (accessToken: string): Promise<string> => {
  const parentId = await findOrCreateFolder(accessToken);
  const q =
    `name='${escapeQuery(BACKUP_FOLDER)}' and mimeType='${FOLDER_MIME}' ` +
    `and '${escapeQuery(parentId)}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    const json = (await res.json()) as DriveListResponse;
    const existing = json.files?.[0];
    if (existing?.id) return existing.id;
    const createRes = await driveFetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      accessToken,
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({
        name: BACKUP_FOLDER,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      }),
    });
    return ((await createRes.json()) as { id: string }).id;
  });
};

const findBackupFileForDate = async (
  accessToken: string,
  folderId: string,
  date: string,
): Promise<string | null> => {
  const q =
    `name='${escapeQuery(backupFilenameForDate(date))}' ` +
    `and '${escapeQuery(folderId)}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`;
  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    const json = (await res.json()) as DriveListResponse;
    return json.files?.[0]?.id ?? null;
  });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** รายการ snapshot ทั้งหมด เรียงใหม่ → เก่า (ไฟล์ชื่อแปลกปลอมถูกข้าม). */
export const listBackups = async (accessToken: string): Promise<BackupFileInfo[]> => {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const q = `'${escapeQuery(folderId)}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size)&pageSize=100&spaces=drive`;
  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    const json = (await res.json()) as DriveListResponse;
    return (json.files ?? [])
      .map((f): BackupFileInfo | null => {
        const date = parseBackupDate(f.name);
        return date
          ? { fileId: f.id, date, sizeBytes: Number(f.size ?? 0) }
          : null;
      })
      .filter((f): f is BackupFileInfo => f !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  });
};

export const hasBackupForDate = async (
  accessToken: string,
  date: string,
): Promise<boolean> => {
  const folderId = await findOrCreateBackupFolder(accessToken);
  return (await findBackupFileForDate(accessToken, folderId, date)) !== null;
};

/** เขียน (สร้างหรือทับ) ไฟล์ snapshot ของ "วันนี้" ด้วย payload ที่ให้มา. */
export const writeBackupSnapshot = async (
  accessToken: string,
  data: WealthLensData,
): Promise<void> => {
  const today = localDateString();
  const folderId = await findOrCreateBackupFolder(accessToken);
  const existingId = await findBackupFileForDate(accessToken, folderId, today);
  const boundary = `wealthlens_backup_${Date.now().toString(36)}`;
  const name = backupFilenameForDate(today);

  if (existingId) {
    // PATCH — ห้ามส่ง parents ตอน update (Drive ตอบ 400) เหมือน syncToDrive
    const { body, contentType } = buildMultipartBody(
      { name, mimeType: JSON_MIME },
      data,
      boundary,
    );
    const url = `${DRIVE_UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id`;
    await retryWithBackoff(() =>
      driveFetch(url, {
        method: 'PATCH',
        accessToken,
        headers: { 'Content-Type': contentType },
        body,
      }),
    );
    return;
  }

  const { body, contentType } = buildMultipartBody(
    { name, mimeType: JSON_MIME, parents: [folderId] },
    data,
    boundary,
  );
  const url = `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`;
  await retryWithBackoff(() =>
    driveFetch(url, {
      method: 'POST',
      accessToken,
      headers: { 'Content-Type': contentType },
      body,
    }),
  );
};

/** ลบ snapshot ที่อายุเกิน retention คืนจำนวนไฟล์ที่ลบ. */
export const pruneOldBackups = async (accessToken: string): Promise<number> => {
  const files = await listBackups(accessToken);
  const expired = selectExpiredBackups(files, localDateString());
  for (const f of expired) {
    await retryWithBackoff(() =>
      driveFetch(`${DRIVE_API}/files/${encodeURIComponent(f.fileId)}`, {
        method: 'DELETE',
        accessToken,
      }),
    );
  }
  return expired.length;
};

/** ดาวน์โหลดเนื้อไฟล์ snapshot เป็น JSON string (ไป validateBackup ต่อ). */
export const downloadBackup = async (
  accessToken: string,
  fileId: string,
): Promise<string> => {
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    return res.text();
  });
};

// ---------------------------------------------------------------------------
// Daily snapshot orchestrator (เรียกจาก sync coordinator)
// ---------------------------------------------------------------------------

/**
 * เขียน snapshot ของวันนี้ถ้ายังไม่มี + prune ของเก่า — best-effort:
 * ห้าม throw ทะลุออกไป (main sync ต้องไม่รู้สึกอะไร) และไม่แตะ sync UI
 * cache วันที่แยกตาม account (multi-user ใน browser เดียวกัน) และจดเฉพาะ
 * เมื่อสำเร็จ เพื่อให้ sync รอบถัดไปของวันลองใหม่เองหลัง failure
 */
export const maybeWriteDailySnapshot = async (
  data: WealthLensData,
  accessToken: string,
  userEmail: string,
): Promise<void> => {
  const today = localDateString();
  const cacheKey = SNAPSHOT_DATE_KEY_PREFIX + userEmail;
  try {
    if (localStorage.getItem(cacheKey) === today) return;
    if (!(await hasBackupForDate(accessToken, today))) {
      await writeBackupSnapshot(accessToken, data);
      const pruned = await pruneOldBackups(accessToken);
      if (pruned > 0) {
        console.info(`[driveBackup] pruned ${pruned} expired snapshot(s)`);
      }
    }
    localStorage.setItem(cacheKey, today);
  } catch (err) {
    console.warn('[driveBackup] daily snapshot skipped:', err);
  }
};
```

- [ ] **Step 3.2:** `npx tsx scripts/verify-drive-backup.ts` ยังผ่าน + `npm run typecheck && npm run lint` clean

- [ ] **Step 3.3:** Commit
```bash
git add src/utils/driveBackup.ts
git commit -m "feat(backup): Drive functions — list/write/prune/download + daily orchestrator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Coordinator Effect D

**Files:**
- Modify: `src/hooks/useDriveSyncCoordinator.ts`

- [ ] **Step 4.1:** อ่านไฟล์ก่อน — ดูว่า `useGoogleAuth()` ที่ destructure ตรงต้น hook มี field user (เช่น `user`) ไหม ถ้า hook ไม่ expose ให้เพิ่มจากของที่มีอยู่แล้วใน auth layer (GoogleUser มี `email`) — ห้ามเปลี่ยน auth logic

- [ ] **Step 4.2:** เพิ่ม import `maybeWriteDailySnapshot` จาก `@/utils/driveBackup` แล้วเพิ่ม Effect D หลัง Effect C:

```ts
  // -------------------------------------------------------------------------
  // Effect D — daily backup snapshot (best-effort, fire-and-forget)
  // -------------------------------------------------------------------------
  // เมื่อ main sync สำเร็จ (status เปลี่ยนเป็น 'synced') ครั้งแรกของวัน →
  // ถ่าย snapshot ขึ้น WealthLens/backups/ + prune ของเก่า ความล้มเหลว
  // ของ snapshot ห้ามกระทบ sync UI — maybeWriteDailySnapshot กลืน error เอง
  useEffect(() => {
    if (!isSignedIn || !accessToken || !user) return undefined;

    const unsubscribe = useSyncStore.subscribe((state, prev) => {
      if (state.status !== 'synced' || prev.status === 'synced') return;
      void maybeWriteDailySnapshot(
        useFinanceStore.getState().data,
        accessToken,
        user.email,
      );
    });
    return unsubscribe;
  }, [isSignedIn, accessToken, user]);
```

(ปรับชื่อตัวแปร `user` ตามที่ hook ใช้จริง; ถ้า subscribe signature ของ zustand ใน repo ไม่ใช่แบบ `(state, prev)` ให้ดู pattern จาก Effect B ที่ subscribe `useFinanceStore` อยู่แล้วและทำตาม)

- [ ] **Step 4.3:** `npm run typecheck && npm run lint` → clean

- [ ] **Step 4.4:** Commit
```bash
git add src/hooks/useDriveSyncCoordinator.ts
git commit -m "feat(backup): Effect D — snapshot รายวันหลัง sync สำเร็จครั้งแรกของวัน

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Restore UI — `DailyBackupSection`

**Files:**
- Create: `src/components/settings/DailyBackupSection.tsx`
- Modify: `src/pages/SettingsPage.tsx` (render ใต้ `<BackupSection />`)

- [ ] **Step 5.1:** อ่าน `src/components/settings/BackupSection.tsx` ก่อน — ดู API จริงของ toast store, สไตล์ section header, ปุ่ม แล้วใช้แบบเดียวกัน โค้ดข้างล่างเขียนด้วยสมมติฐาน `useToastStore((s) => s.push)({ type, message })` — **ถ้าของจริงต่าง ให้ตามของจริง**

- [ ] **Step 5.2:** สร้าง `src/components/settings/DailyBackupSection.tsx`:

```tsx
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
      // 1) Undo path: เก็บสภาพปัจจุบันเป็นไฟล์ของวันนี้ก่อนเสมอ
      await writeBackupSnapshot(accessToken, useFinanceStore.getState().data);
      // 2) ดาวน์โหลด + validate ผ่านเส้นทางเดียวกับ Import ไฟล์มือ
      const raw = await downloadBackup(accessToken, file.fileId);
      const result = validateBackup(JSON.parse(raw) as unknown);
      if (!result.ok) {
        pushToast({
          type: 'error',
          message: `ไฟล์ backup ${file.date} ไม่ผ่านการตรวจสอบ — ข้อมูลปัจจุบันไม่ถูกแตะ`,
        });
        return;
      }
      replaceAllData(result.data);
      pushToast({
        type: 'success',
        message: `กู้ข้อมูลจาก ${file.date} แล้ว — เปลี่ยนใจกู้กลับได้จากไฟล์ของวันนี้`,
      });
      void loadList(); // ไฟล์วันนี้เพิ่งถูกเขียนทับ — refresh ขนาด/รายการ
    } catch {
      pushToast({
        type: 'error',
        message: 'กู้ข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง ข้อมูลปัจจุบันไม่ถูกแตะ',
      });
    } finally {
      setRestoringId(null);
      setConfirmingId(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">
          🗓️ Backup รายวัน (Drive)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          ระบบถ่ายสำเนาข้อมูลขึ้น Drive วันละไฟล์อัตโนมัติ เก็บย้อนหลัง{' '}
          {BACKUP_RETENTION_DAYS} วัน — กู้กลับเป็นข้อมูลของวันไหนก็ได้
        </p>
      </header>

      {!isSignedIn ? (
        <p className="text-sm text-slate-500">
          ต้อง sign in Google ก่อน จึงจะดูและกู้ backup รายวันได้
        </p>
      ) : loadState === 'idle' ? (
        <button
          type="button"
          onClick={() => void loadList()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          โหลดรายการ backup
        </button>
      ) : loadState === 'loading' ? (
        <p className="text-sm text-slate-500">กำลังโหลดรายการ…</p>
      ) : loadState === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-expense">โหลดรายการไม่สำเร็จ</p>
          <button
            type="button"
            onClick={() => void loadList()}
            className="text-sm text-primary hover:underline"
          >
            ลองใหม่
          </button>
        </div>
      ) : backups.length === 0 ? (
        <p className="text-sm text-slate-500">
          ยังไม่มีไฟล์ backup — ไฟล์แรกจะถูกสร้างหลัง sync สำเร็จครั้งแรกของวัน
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {backups.map((b) => (
            <li key={b.fileId} className="flex items-center justify-between py-2 gap-3">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-slate-700 tabular-nums">
                  {b.date}
                </span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {formatSize(b.sizeBytes)}
                </span>
              </div>
              {confirmingId === b.fileId ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">
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
                    className="text-xs text-slate-500 hover:underline"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={restoringId !== null}
                  onClick={() => setConfirmingId(b.fileId)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  กู้จากวันนี้
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
```

หมายเหตุ label ปุ่ม: "กู้จากวันนี้" ในแถวของแต่ละวันอ่านแปลก — ใช้ "กู้คืน" เฉยๆ ถ้าดูแล้วสื่อกว่า (ตัดสินใจตอน implement ได้ ไม่ต้องถาม)

- [ ] **Step 5.3:** ใน `src/pages/SettingsPage.tsx` เพิ่ม import + render `<DailyBackupSection />` ถัดจาก `<BackupSection />` (บรรทัด ~182)

- [ ] **Step 5.4:** `npm run typecheck && npm run lint` → clean และ `npm run build` สำเร็จ

- [ ] **Step 5.5:** Commit
```bash
git add src/components/settings/DailyBackupSection.tsx src/pages/SettingsPage.tsx
git commit -m "feat(backup): Settings UI — list + restore backup รายวัน

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verification + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 6.1:** UI smoke ด้วย Playwright บน dev server โหมด local-only (`VITE_GOOGLE_CLIENT_ID="" npm run dev -- --port 5188`): เปิด `/settings` → ต้องเห็น section "Backup รายวัน (Drive)" พร้อมข้อความ "ต้อง sign in Google ก่อน" (สถานะ signed-out) — screenshot เก็บไว้

- [ ] **Step 6.2:** Drive integration ทดสอบกับ token จริงไม่ได้ในเครื่องนี้ — บันทึกใน checkpoint ว่า manual test กับ account ของ Tom ค้างอยู่: (1) เปิดแอป + sign in → ไฟล์ `wealthlens_backup_<วันนี้>.json` โผล่ใน Drive/WealthLens/backups (2) กดกู้จากไฟล์เมื่อวาน → confirm → ข้อมูลเปลี่ยน + toast (3) กู้ไฟล์วันนี้กลับ → ได้สภาพเดิม

- [ ] **Step 6.3:** เพิ่ม F28 ใน `features.json` (`phases` → phase_4 → `features`):

```json
{
  "id": "F28",
  "name": "Daily Drive Backup Snapshots (backup รายวัน)",
  "description": "snapshot ข้อมูลขึ้น WealthLens/backups/ วันละไฟล์อัตโนมัติ + retention 30 วัน + restore UI ใน Settings",
  "status": "completed",
  "priority": "P1",
  "phase": "phase_4",
  "acceptanceCriteria": [
    "หลัง sync สำเร็จครั้งแรกของวัน → เขียน wealthlens_backup_YYYY-MM-DD.json (local date)",
    "กันซ้ำข้ามแท็บ/เครื่องด้วย hasBackupForDate + cache วันที่ per-user",
    "ลบไฟล์เก่ากว่า 30 วันอัตโนมัติ",
    "snapshot ล้มเหลว = เงียบ ไม่กระทบ main sync / sync UI",
    "Settings: list snapshot + ปุ่มกู้พร้อม inline confirm",
    "ก่อนกู้เขียน snapshot สภาพปัจจุบันทับไฟล์วันนี้ (undo ได้)",
    "restore ผ่าน validateBackup + replaceAllData (เส้นทางเดียวกับ Import)",
    "scope Drive ยังเป็น drive.file เท่านั้น"
  ],
  "estimatedHours": 8,
  "dependencies": [],
  "checkpoint": {
    "completed": true,
    "completedAt": "2026-06-12",
    "notes": "Spec: docs/superpowers/specs/2026-06-12-daily-drive-backup-design.md | Helpers verified: scripts/verify-drive-backup.ts | Drive integration: รอ manual test กับ account จริงของ Tom"
  }
}
```

และอัปเดต `progressSummary`: `totalFeatures: 36`, `completed: 36`

- [ ] **Step 6.4:** Validate JSON + commit
```bash
node -e "JSON.parse(require('fs').readFileSync('features.json','utf8')); console.log('valid')"
git add features.json
git commit -m "docs: F28 daily Drive backup — completed (รอ manual Drive test)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- Spec coverage: Drive layer + pure helpers (Task 2-3), trigger per-user cache (Task 3-4), retention 30 วัน (Task 2-3), restore UI + undo + confirm (Task 5), edge cases (กันซ้ำ→hasBackupForDate, fail เงียบ→try/catch ใน orchestrator, ไฟล์เพี้ยน→validateBackup, token หมดอายุ→HttpError เส้นทางเดิม), testing (Task 2 script, Task 6 Playwright + manual) ✓
- Type consistency: `BackupFileInfo {fileId,date,sizeBytes}` ใช้ตรงกันใน driveBackup, script, UI; `maybeWriteDailySnapshot(data, accessToken, userEmail)` ตรงกับ Effect D ✓
- ไม่มี placeholder; จุดที่ต้องเช็คของจริง (toast API, ชื่อ field user) ระบุวิธีตัดสินใจชัดเจน ✓
