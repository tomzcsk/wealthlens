# Design: Daily Drive Backup Snapshots (backup รายวัน)

**Date:** 2026-06-12
**Status:** Approved by Tom
**Scope:** snapshot ข้อมูลทั้งก้อนขึ้น Google Drive วันละไฟล์อัตโนมัติ + retention 30 วัน
+ หน้า list/restore ใน Settings

## Requirements (จากการคุยกับ Tom)

1. **เก็บบน Google Drive** — โฟลเดอร์ `WealthLens/backups/`, ไฟล์
   `wealthlens_backup_YYYY-MM-DD.json` วันละไฟล์ (browser สั่งดาวน์โหลด
   ลงเครื่องรายวันแบบเงียบไม่ได้ — Drive คือทางเดียวที่อัตโนมัติจริง)
2. **Retention 30 วัน** — เกินกว่านั้นลบไฟล์เก่าทิ้งอัตโนมัติ
3. **Restore UI ใน Settings** — list snapshot + ปุ่มกู้ พร้อม confirm
4. **ความปลอดภัยข้อมูลปัจจุบัน (ยืนยันกับ Tom แล้ว):** เส้นทาง snapshot
   เป็น write-only ไปโฟลเดอร์ backups เท่านั้น ห้ามแตะไฟล์หลัก/LocalStorage;
   ข้อมูลปัจจุบันเปลี่ยนได้ทางเดียวคือผู้ใช้กดกู้เอง (confirm + undo ได้)

## Approach (A — approved)

เกาะ sync เดิม: หลัง `syncToDrive` สำเร็จครั้งแรกของวัน → เขียน snapshot +
prune ไฟล์เกิน 30 วัน ไม่มีตัวตั้งเวลาใหม่ วันไหนไม่เปิดแอปไม่มี snapshot
ซึ่งถูกต้อง (ข้อมูลไม่เปลี่ยนวันนั้น snapshot ล่าสุดยังตรง)

ทางที่ไม่เลือก: Drive revisions (Google ลบ revision เองหลัง 30 วัน/100
รายการ ควบคุมไม่ได้, ไม่ตรง mental model วันละไฟล์), snapshot ตอนเปิดแอป
(เพิ่มเส้นทางใหม่ตอน boot ที่เคยมีบั๊ก first-sync overwrite — เสี่ยงไม่คุ้ม)

## 1. Drive layer — `src/utils/driveBackup.ts` (module ใหม่)

แยกจาก `driveSync.ts` (ไฟล์นั้นดูแล main sync อย่างเดียว) แต่ reuse
`findOrCreateFolder`, `retryWithBackoff`, รูปแบบ auth token เดิม:

```ts
const BACKUP_FOLDER = 'backups';            // ใต้ WealthLens/
const BACKUP_PREFIX = 'wealthlens_backup_'; // + YYYY-MM-DD + .json
const BACKUP_RETENTION_DAYS = 30;

interface BackupFileInfo { fileId: string; date: string; sizeBytes: number }

listBackups(token): Promise<BackupFileInfo[]>      // เรียงใหม่→เก่า
hasBackupForDate(token, date): Promise<boolean>    // กันซ้ำข้ามเครื่อง/แท็บ
writeBackupSnapshot(token, data): Promise<void>    // เขียน/ทับไฟล์ของวันนี้
pruneOldBackups(token): Promise<number>            // ลบเก่ากว่า 30 วัน, คืนจำนวนที่ลบ
downloadBackup(token, fileId): Promise<string>     // JSON string สำหรับ restore
```

- วันที่ = **local date ของเครื่อง** (วันแบบที่ Tom เห็น ไม่ใช่ UTC)
- pure helpers แยก export เพื่อทดสอบได้: `backupFilenameForDate(date)`,
  `parseBackupDate(filename)`, `selectExpiredBackups(list, today, retentionDays)`
- scope Drive เดิม `drive.file` (แอปสร้างไฟล์เอง) — ไม่ขอสิทธิ์เพิ่ม

## 2. Trigger — เกาะ `useDriveSyncCoordinator`

หลัง main sync สำเร็จ:

```
key = 'wealthlens_last_snapshot_date_' + <user id ของ account ที่ sign in>
ถ้า localStorage[key] !== วันนี้:
  → hasBackupForDate(วันนี้)?  (กันเครื่อง/แท็บอื่นเขียนไปแล้ว)
     → ยังไม่มี: writeBackupSnapshot(data) แล้ว pruneOldBackups()
  → จด localStorage[key] = วันนี้
```

Cache key แยกตาม account (แอป multi-user ตาม F18 — ใช้ identifier เดียวกับ
ที่ระบบ per-user data isolation ใช้อยู่) ไม่งั้น account ที่สองใน browser
เดียวกันจะโดนข้าม snapshot ของวันนั้นเพราะ cache ของ account แรก

หลักการ: **เงียบและห้ามรบกวน main sync** — snapshot ล้มเหลว = `console.warn`
เท่านั้น ไม่ขึ้น error UI, ไม่ retry วนหนัก (sync รอบถัดไปของวันลองใหม่เอง
เพราะ date ยังไม่ถูกจด), ห้าม throw ทะลุไปทำ main sync พัง (try/catch ครอบ)

## 3. Restore UI — เพิ่มใน `BackupSection` (Settings)

- หัวข้อใหม่ "Backup รายวัน (Drive)" ใต้ Export/Import เดิม
- ไม่ sign in → แสดง "ต้อง sign in Google ก่อน" แทน list
- list โหลดตอนผู้ใช้กดขยาย section (lazy — ไม่ query ทุกครั้งที่เปิด Settings):
  วันที่ + ขนาดไฟล์ + ปุ่ม "กู้จากวันนี้" ต่อแถว
- กดกู้ → confirm dialog: "ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลของวันที่ X"
- ยืนยันแล้ว flow คือ (**read-before-write** — แก้จาก draft แรกหลัง review
  พบว่าเขียน undo ก่อนดาวน์โหลดจะทำลายไฟล์เป้าหมายในเคสกู้ไฟล์ของวันนี้เอง
  ซึ่งเป็นเคสที่ใช้บ่อยสุด: ข้อมูลพังบ่าย → ถอยกลับ snapshot เช้า):
  1. `downloadBackup` → `JSON.parse` → `validateBackup` (เส้นทางเดียวกับ
     Import ที่แก้แล้ว — years/loans/gold/preferences/taxAllowances ครบ)
     ไม่ผ่าน → toast error, **ยังไม่มีอะไรถูกเขียนเลย**
  2. ผ่านแล้วจึง **เขียน snapshot สภาพปัจจุบันทับไฟล์ของวันนี้** (undo path —
     เปลี่ยนใจกู้ไฟล์วันนี้กลับได้ และไฟล์เป้าหมายถูกอ่านขึ้นมาแล้วก่อนถูกทับ)
  3. `replaceAllData` → toast สำเร็จ
- หลังกู้ `lastUpdated` ถูก bump → main sync push ข้อมูลที่กู้ขึ้น Drive เอง
  (สอดคล้อง conflict resolution เดิม)

## 4. Edge cases

| เคส | พฤติกรรม |
|---|---|
| หลายแท็บ/เครื่องวันเดียวกัน | `hasBackupForDate` เช็คก่อน; race สุดๆ ก็แค่ไฟล์เดียวถูกทับด้วยข้อมูลใหม่กว่า — ไม่เสียหาย |
| snapshot fail (เน็ต/token) | เงียบ, log, ไม่แตะ main sync, รอบถัดไปลองใหม่ |
| กู้แล้วเปลี่ยนใจ | ไฟล์วันนี้ = สภาพก่อนกู้ (เขียนไว้ใน step 2) → กู้กลับได้ |
| กู้ไฟล์ของวันนี้เอง | ปลอดภัย — ไฟล์ถูกดาวน์โหลดมาแล้วใน step 1 ก่อนถูกทับใน step 2 |
| ไฟล์ใน backups โดนแก้มือจน parse ไม่ได้ | validateBackup ปฏิเสธ → toast error, ข้อมูลปัจจุบันปลอดภัย |
| token หมดอายุระหว่าง restore | error ปกติของ Drive layer → toast ให้ sign in ใหม่ |
| ขนาดพื้นที่ | 30 × ~100KB ≈ 3MB — ไม่เป็นประเด็น |

## 5. การทดสอบ

1. Pure helpers (ชื่อไฟล์, parse วันที่, คัดไฟล์หมดอายุ) → verification
   script `scripts/verify-drive-backup.ts` รันด้วย `npx tsx` (pattern เดิม)
2. Drive functions ต้องใช้ token จริง → manual กับ account ของ Tom:
   เปิดแอป → เช็คไฟล์โผล่ใน Drive → restore → undo
3. UI logic ที่ mock ได้ → Playwright (สถานะ signed-out, list rendering)
4. `npm run typecheck` + `npm run lint` ทุก commit
