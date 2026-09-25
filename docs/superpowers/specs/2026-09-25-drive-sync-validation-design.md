# กัน Drive โหลดข้อมูลเสียมาทับ (Drive sync validation + block)

> Spec · 2026-09-25 · Phase post-ship · ออกแบบคู่กับ Codex (gpt-6-luna)

## ปัญหา

การดึงไฟล์หลักจาก Google Drive **ไม่ validate**: `loadFromDrive` ใน
`src/utils/driveSync.ts` (~L321) ทำ `const json = (await res.json()) as WealthLensData`
— cast ตรง ๆ. ค่านี้ถูกยัดเข้า store ด้วย `replaceAllData(remote)` ที่ **2 จุด** ใน
`src/hooks/useDriveSyncCoordinator.ts`: Effect A (first-load reconciliation, ~L174) และ
`manualReload` (ปุ่ม "คืนค่า" ใน Settings, ~L331). ไฟล์ Drive ที่เสีย/ผิดรูปจึงเขียนทับ
ข้อมูลจริงในเครื่องได้เงียบ ๆ.

ตรงข้ามกับ **daily-backup restore** (`driveBackup.ts` + `DailyBackupSection.tsx`) ที่
`validateBackup` ก่อน `replaceAllData` อยู่แล้ว — pattern ที่ปลอดภัยมีอยู่แล้ว ให้ reuse.
มี daily snapshot ใน `WealthLens/backups/` เป็นแหล่งกู้ด้วย.

## พฤติกรรมที่เลือก (จาก Tom)

เจอไฟล์ Drive ที่ validate ไม่ผ่านตอนดึง → **เก็บของเครื่องไว้ ไม่ทับ**:
ไม่ `replaceAllData` · แจ้งผู้ใช้ · **หยุด auto-push ชั่วคราว** เพื่อไม่ให้เขียนทับไฟล์เสียบน
Drive (กู้จาก daily backup ได้) · ผู้ใช้ตัดสินใจเองใน Settings ("ใช้ข้อมูลในเครื่อง เขียนทับ
Drive").

## ดีไซน์

### 1. Validate ที่จุดเดียว — `loadFromDrive`

แยก pure fn ที่เทสต์ได้:

```ts
export type DriveLoadResult =
  | { kind: 'empty' }                         // ไม่มีไฟล์บน Drive (ของใหม่)
  | { kind: 'ok'; data: WealthLensData }       // valid (= validateBackup(...).data ที่ normalize แล้ว)
  | { kind: 'invalid'; reason: string };       // มีไฟล์แต่ JSON พัง/validate ไม่ผ่าน

export const interpretDrivePayload = (text: string): DriveLoadResult;
```

- `interpretDrivePayload`: `JSON.parse` ใน try/catch → พัง = `invalid`; ผ่านแล้ว
  `validateBackup(parsed)` → `ok:false` = `invalid` (รวม errors ย่อเป็น reason), `ok:true` =
  `{kind:'ok', data}`. **ใช้ `validateBackup(...).data` ไม่ใช่ raw** — normalize เหมือน import.
- `loadFromDrive`: ไม่มี fileId → `{kind:'empty'}`; มีไฟล์ → fetch text → `interpretDrivePayload`.
  เปลี่ยน return type จาก `WealthLensData | null` → `DriveLoadResult`.
- **Semantic (Codex):** ไฟล์ที่เป็น JSON `{}` หรืออ่านได้แต่ผิดรูป = `invalid` ไม่ใช่ `empty`;
  `empty` = ไม่มีไฟล์เท่านั้น; WealthLensData ที่ว่างแต่ valid = `ok`.

### 2. syncStore — สถานะ block

เพิ่ม field ใน `src/stores/syncStore.ts`:
```ts
blocked: { reason: string } | null;   // ค่าเริ่ม null
setBlocked: (b: { reason: string } | null) => void;
```
`reset()` (ตอน sign-out) เคลียร์ `blocked` ได้ — ไม่ต้องเก็บถาวร เพราะไฟล์ยังเสียอยู่ →
first-load รอบใหม่ re-detect แล้ว re-block **ก่อน** auto-push เสมอ (ดู §4 การกัน race).

### 3. Coordinator — จัดการ 3 kinds

`Effect A` และ `manualReload` switch ตาม `result.kind`:
- `empty` → ทางเดิม (บัญชีใหม่: push local ถ้าไม่ว่าง)
- `ok` → ทางเดิม (reconcile ด้วย `result.data`)
- `invalid` → **keep local**: `cancelPendingSync()` (ฆ่า write ที่ค้างคิว) · `setBlocked({reason})` ·
  `setStatus('error', 'ข้อมูลใน Google Drive เสียหาย — ใช้ข้อมูลในเครื่องต่อ')` · toast ·
  **`hasInitializedRef.current = true`** (กัน coordinator ค้าง uninitialized) · **ไม่ push**

### 4. หยุด auto-push ทุกทาง (กัน race — Codex)

Auto-push มี 3 ทาง ทั้งหมดอยู่ใน coordinator → guard ที่ต้นทางทุกทาง:
- **Effect B** (subscription): `if (useSyncStore.getState().blocked) return;` ก่อน `debouncedSync`
- **Effect C** (online-retry): เช็ค `blocked` ก่อน `debouncedSync`
- **`pushNow` / `manualSync`**: refuse ถ้า blocked

การกัน queued flush: `cancelPendingSync()` ตอน invalid ฆ่า timer ที่ค้าง; และเมื่อ blocked
Effect B ไม่ queue อะไรใหม่ → flush ไม่มีอะไรให้ยิง.

**Race ที่ยอมรับได้ (ยืนยันแล้ว):** first-load (Effect A) รันก่อน auto-sync active
(Effect B gate ด้วย `hasInitializedRef`) → ไม่มี auto-push in-flight ตอน detect invalid.
กรณี `manualReload` ที่มี push ของ local ค้าง in-flight = เขียน local ทับไฟล์เสีย ซึ่งคือ
การ resolve อยู่แล้ว (ไม่เสียข้อมูลจริง).

### 5. ทางออกให้ผู้ใช้ (SettingsPage)

เพิ่ม coordinator handle: `resolveWithLocal(): Promise<void>` — `syncToDrive(local)` ตรง ๆ
(ข้าม guard เพราะเป็นเจตนา) → สำเร็จ → `setBlocked(null)` + `setStatus('synced')`.

ใน `SettingsPage.tsx` ส่วน sync: เมื่อ `blocked` → แถบเตือน + ปุ่ม **"ใช้ข้อมูลในเครื่อง
เขียนทับ Google Drive"** (เรียก `resolveWithLocal`) + ข้อความชี้ไป DailyBackupSection
("กู้จาก backup รายวันได้"). สีจาก token (F46). มือถือมี breakpoint (F47).

## ขอบเขต (ยืนยันกับ Tom)

- **จับข้อมูลเสียใน "แกนการเงิน" ครบ** — `validateBackup` strict กับ `years` /
  `bankAccounts` / `bankTransactions` (validate ราย member, reject ถ้ามี junk).
- **ไม่รวม:** ส่วน optional (`taxAllowances` / `goldHoldings` / `loans` / `preferences`)
  `validateBackup` ปล่อยผ่าน/ตัดทิ้งเงียบ (`exportImport.ts:538-587`, พฤติกรรม import เดิม) —
  ไฟล์ที่เสียเฉพาะส่วนนี้อาจ validate `ok` โดยตัดส่วนเสียทิ้ง. การทำ validator ให้เข้มขึ้น
  เป็น **follow-up แยก** (ตรงกับที่ Codex เสนอในโรดแมป) ไม่อยู่ใน scope นี้.
- **ไม่แตะ** daily-backup restore (validate อยู่แล้ว) และ conflict resolution แบบ timestamp.

## Testing (TDD, สไตล์โปรเจกต์ — ดู [[verification-workflow]])

`scripts/verify-drive-validation.ts` (ใหม่, tsx) — เทสต์ pure `interpretDrivePayload`:
1. text ที่ JSON พัง (`'{oops'`) → `invalid`
2. `'{}'` (JSON valid แต่ไม่ใช่ WealthLensData) → `invalid`
3. snapshot จริง (สร้างจาก store export / seedData) → `ok`, `data.years` ครบ
4. WealthLensData ที่ valid แต่ว่าง → `ok` (ไม่ใช่ empty)
5. **round-trip:** store data → `JSON.stringify` → `interpretDrivePayload` → `ok` และ data
   เท่าเดิม (กัน validateBackup reject สิ่งที่ syncToDrive เขียนเอง)
6. bankTransactions ที่มี junk member → `invalid` (แกนการเงิน strict)

`syncStore` block + coordinator guard: หน่วย logic เท่าที่แยกเป็น pure ได้ (การ decide push
vs skip เมื่อ blocked) — ที่เหลือเป็น React effect ตรวจด้วยตาผ่าน `verify:mobile` shell +
รันจริงในเบราว์เซอร์ (seed ไฟล์เสียใน localStorage-as-Drive ไม่ได้ตรง ๆ; ทดสอบ interpret +
block logic เป็นหลัก).

มาตรฐาน: typecheck + lint + `verify-import-integrity` (round-trip เดิม) + `verify-drive-backup`
ไม่ regress.

## ไม่ทำ (YAGNI)

- ไม่เก็บ block ถาวร (sessionStorage) — re-detect ครอบแล้ว (§4)
- ไม่เพิ่ม `force` param ให้ `syncToDrive` — override เรียก `syncToDrive` ตรง ๆ, auto-path
  guard ที่ coordinator + cancelPendingSync พอ
- ไม่ทำ conflict-merge / validator ส่วน optional ให้เข้ม (follow-up แยก)
