# ปุ่ม "ตั้งยอด" — reset ยอดบัญชีธนาคารเป็นเลขที่กรอก

> Spec · 2026-09-24 · Phase post-ship (ต่อจาก F53)

## ปัญหา / ที่มา

Tom ดูการ์ดบัญชี (เช่น CLICX ยอดสะสม ฿3,965) แล้วอยากพิมพ์ยอดที่ควรจะเป็นจริง ๆ
เข้าไปตรง ๆ ("รีเซตเป็น ฿5,000") แทนที่จะต้องคิดเองว่าต้องฝากหรือถอนเท่าไหร่.

ยอดบนการ์ด = `accountAllTimeTotal` = **ผลรวมทุกเดือนทุกปี** ไม่ใช่ค่าช่องเดียว
(F40/F48: `balances[ปี][เดือน]` = กระแสเงินของเดือนนั้น). ดังนั้น "ตั้งยอด" ต้องแปลง
เป็น "ต้องขยับเงินเท่าไหร่ในเดือนนี้ ยอดสะสมถึงจะเท่าเลขที่กรอก" ไม่ใช่เขียนทับ field.

## ข้อตกลงที่อนุมัติแล้ว

- **ความหมาย:** ตั้ง *ยอดสะสม* (`accountAllTimeTotal`) ให้เท่าเลขที่กรอกพอดี — เก็บประวัติรายเดือนเดิมไว้ครบ
- **ประวัติลงเป็นส่วนต่างจริง:** เดิม ฿2,000 → ตั้ง ฿1,500 = ลงประวัติ "ถอนเงิน ฿500" (ไม่ใช่บรรทัดพิเศษ "รีเซต")
- **UI:** ปุ่มที่ 4 "ตั้งยอด" ข้าง ฝาก/ถอน/โอน
- **เดือนที่ลง:** เดือนปัจจุบันจากนาฬิกาเครื่อง (เหมือน ฝาก/ถอน/โอน) — ไม่มีตัวเลือกเดือน

## กลไก (ไม่มี logic การเงินใหม่)

`setBankTotal` เป็น action บาง ๆ ที่ derive delta จาก state สด แล้วลงผ่านประตูเดิม
(`withLedger` → `applyBankMovement` → `ledgerPatch`) เหมือน `depositBank`/`withdrawBank` เป๊ะ:

```
delta = target − accountAllTimeTotal(account)
delta === 0  → no-op (return state)
delta  >  0  → applyBankMovement(amount: +delta, label: 'ฝากเงิน', source: manual)
delta  <  0  → applyBankMovement(amount:  delta, label: 'ถอนเงิน', source: manual)   // delta ติดลบอยู่แล้ว
```

- ลงที่ `(year, month)` = เดือนปัจจุบัน (UI ส่งมาจาก `new Date()` เหมือน `BankActionForm`)
- ผ่าน `applyBankMovement` ตัวเดียวกับ ฝาก/ถอน → invariant F40 (Σ รายการในเดือน === ค่าในช่อง) คงอยู่เอง
- source `manual` → `deleteBankTransaction` ลบได้ = **ย้อนได้** (ลบบรรทัดแล้วยอดสะสมกลับเท่าเดิม)
- หลังลง: `accountAllTimeTotal(account) === target` เสมอ

### ทำไมเป็น store action ไม่ใช่ให้ UI คิด delta เอง

delta ต้อง derive จาก `accountAllTimeTotal` ของ **state สด ณ เวลา dispatch** ไม่ใช่ค่าที่ memo
ไว้ใน component (กฎ CLAUDE.md: "ทุก calculation derive จาก store"). action รับ `target` +
`(year, month)` แล้วอ่าน account จาก state เอง → เทสต์ได้ deterministic (ส่ง year/month ตรง ๆ
ไม่พึ่งนาฬิกา เหมือน `depositBank`).

### Signature

```ts
setBankTotal: (id: string, year: number, month: number, target: number) => void;
```

วางถัดจาก `withdrawBank` ทั้งใน interface (`~L678`) และ implementation (`~L2081`) ของ
`src/stores/financeStore.ts`. ต้อง import `accountAllTimeTotal` จาก `utils/bankAccounts`
(เช็คว่ามี import อยู่แล้วหรือยัง).

## UI

### ปุ่มที่ 4 — `src/components/accounts/BankAccountDetail.tsx`

- เพิ่มปุ่ม "ตั้งยอด" ในแถวปุ่ม (ปัจจุบัน ฝาก/ถอน/โอน ที่ ~L169-193) → `setAction('setTotal')`
- แถวปุ่มต้อง wrap ได้บนมือถือ (4 ปุ่มอาจตกเป็น 2 แถว) — ใช้ utility ที่ยอมให้ wrap, มี
  breakpoint กำกับถ้าเป็นสไตล์เฉพาะมือถือ (กฎ M6). เดสก์ท็อปห้ามขยับ
- ขยาย state `action` ให้รับ `'setTotal'` และ modal (~L250-274) เปิดฟอร์มใหม่เมื่อ `action === 'setTotal'`
- สีปุ่มจาก token เท่านั้น (F46) — ห้ามสีดิบ. ใช้สไตล์ปุ่ม outline แบบ "โอน" เป็นฐาน

### ฟอร์มใหม่ — `src/components/accounts/SetBankTotalForm.tsx` (component แยก, < 150 บรรทัด)

รับ props: `account`, `year`, `month`, `onDone` (ปิด modal) — คู่ขนานกับ `BankActionForm`.

- แสดง **ยอดสะสมตอนนี้** (`accountAllTimeTotal`, format ผ่าน `utils/formatters`)
- ช่องกรอก **ยอดเป้าหมาย** (numeral format, ยอมค่า 0 และติดลบ — กฎ F44 ไม่ clamp)
- **พรีวิวสด** จาก `target − current`:
  - `> 0` → "จะบันทึกเป็น: ↓ ฝากเงิน ฿{delta} ({เดือนไทย ปี})"
  - `< 0` → "จะบันทึกเป็น: ↑ ถอนเงิน ฿{|delta|} ({เดือนไทย ปี})"
  - `= 0` → "ยอดเท่าเดิม ไม่มีอะไรเปลี่ยน" + ปุ่มยืนยัน disabled
- ช่องว่าง / ไม่ใช่ตัวเลข → ปุ่มยืนยัน disabled
- ยืนยัน → `setBankTotal(account.id, year, month, target)` แล้ว `onDone()`
- เดือน/ปี มาจาก `new Date()` ใน component (เหมือน `BankActionForm` L79-82) ส่งเข้า action
- ตัวเลขใช้ `tabular-nums`; ไม่มีเลขวิ่งในฟอร์ม

## เคสขอบ

| เคส | พฤติกรรม |
|-----|----------|
| target === ยอดสะสมเดิม | no-op, ปุ่มยืนยัน disabled ("ยอดเท่าเดิม") |
| target = 0 | ถอนทั้งหมด (delta = −current) — valid |
| target ติดลบ | ยอมได้ ยอดสะสมติดลบเป็นค่าจริง (F44/F8 ไม่ clamp) |
| account ไม่มีจริง | action no-op (guard `find` = undefined) |
| ช่องว่าง/ตัวอักษร | ปุ่ม disabled ไม่ dispatch |

## ความปลอดภัยข้อมูล

- **ไม่เพิ่ม field ที่ persist** — เขียนแค่ `bankTransactions` (`manual`) + `balances` ที่มีอยู่แล้ว
- ⇒ **export/import validator และ Drive backup ไม่ต้องแตะ** (ไม่เข้าเงื่อนไข memo "new persisted field needs exportImport")
- ทุกการเขียนจบที่ `ledgerPatch` ผ่าน `withLedger` (กฎ F49) — เก็บกวาดเซลล์กำพร้าอัตโนมัติ

## เทสต์ (TDD)

**Store (`financeStore` / `bankMovements` unit):**
1. ตั้งขึ้น (current 3,965 → target 5,000): ลง `manual` +1,035 label 'ฝากเงิน' เดือนที่ส่ง; `accountAllTimeTotal === 5000`
2. ตั้งลง (2,000 → 1,500): ลง `manual` −500 label 'ถอนเงิน'; total === 1500
3. ตั้งเท่าเดิม: state ไม่เปลี่ยน (no tx เพิ่ม)
4. ตั้งเป็น 0: total === 0, ลง −current
5. ตั้งติดลบ (100 → −50): total === −50 (ไม่ clamp)
6. account ไม่มี → no-op
7. invariant F40: Σ รายการในเดือนนั้น === `balances[year][month]` หลังตั้งยอด
8. ย้อนได้: `deleteBankTransaction(บรรทัดที่เพิ่ง reset)` → total กลับเท่าเดิม

**Component (`SetBankTotalForm`):**
9. พิมพ์ target > current → พรีวิวโชว์ "ฝากเงิน ฿delta"; ยืนยันเรียก `setBankTotal` ด้วยค่าถูก
10. พิมพ์ target < current → พรีวิว "ถอนเงิน"
11. target เท่าเดิม / ช่องว่าง → ปุ่ม disabled

## ไม่ทำ (YAGNI)

- ไม่มีตัวเลือกเดือน/ปี (ลงเดือนปัจจุบันเท่านั้น)
- ไม่มี source type ใหม่ ("reset") — ใช้ `manual` เพื่อให้อ่านเหมือน ฝาก/ถอน ปกติ ตามที่ Tom ขอ
- ไม่ยุ่งกับ gold/income/expense/savings-linked lines — reset แตะแค่ manual delta ก้อนเดียว
```
