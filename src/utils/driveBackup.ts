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
  // วันที่เพี้ยนห้ามกลายเป็น "ทุกไฟล์หมดอายุ" — เลือกไม่ลบอะไรเลยแทน
  if (Number.isNaN(cutoff.getTime())) return [];
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  const cutoffStr = localDateString(cutoff);
  return files.filter((f) => f.date < cutoffStr);
};

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

/** เขียน (สร้างหรือทับ) ไฟล์ snapshot ของวันที่ระบุ (default วันนี้) ด้วย payload ที่ให้มา. */
export const writeBackupSnapshot = async (
  accessToken: string,
  data: WealthLensData,
  date: string = localDateString(),
): Promise<void> => {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const existingId = await findBackupFileForDate(accessToken, folderId, date);
  const boundary = `wealthlens_backup_${Date.now().toString(36)}`;
  const name = backupFilenameForDate(date);

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
      await writeBackupSnapshot(accessToken, data, today);
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
