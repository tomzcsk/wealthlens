# F39 — รายได้เข้าบัญชีอัตโนมัติ (Income → Bank deposit) + ประเภทบัญชี

*Design · 2026-07-09*

## 1. ปัญหา

ทุกเดือน Tom กรอกเงินเดือน/โบนัส/คอม/รายได้อื่นๆ ในหน้ารายเดือน แล้ว **ต้องไปพิมพ์ยอดฝากเข้าบัญชีธนาคารซ้ำอีกรอบด้วยมือ** ข้อมูลเดียวกันถูกกรอกสองที่ และถ้าลืมกรอกรอบสอง ยอดบัญชี (ซึ่งไหลไปถึงหน้าความมั่งคั่ง F38) ก็ผิด

รายจ่ายแก้ปัญหานี้ไปแล้วด้วย F34 (`paymentAccountId` → หักยอดบัญชี) ฝั่งรายรับยังไม่มี

## 2. เป้าหมาย

กรอกรายได้ครั้งเดียว → เงินเข้าบัญชีที่ถูกต้องอัตโนมัติ โดยผู้ใช้ **เลือกปลายทางแยกต่อช่องรายได้** และเห็นสรุปก่อนบันทึกทุกครั้งว่าจะมีเงินเข้าบัญชีไหนเท่าไหร่

## 3. ขอบเขต

**In scope**
1. `BankAccount.type?: BankAccountType` — `'salary' | 'savings' | 'cash' | 'other'` ใช้ตั้ง default ปลายทาง + แสดง badge บนการ์ด
2. `MonthlyIncome.deposits?` — ปลายทางต่อช่อง (เงินเดือน / โบนัส / คอม / อื่นๆ) แต่ละช่องเลือกบัญชีได้ หรือ "ไม่ลงบัญชี"
3. ยอดที่ฝากเข้าบัญชีเงินเดือน = **`salary − totalDeductions`** (เงินที่ธนาคารได้จริงหลังหักภาษี/ประกันสังคม/กองทุน/กยศ/ลงทุน)
4. โบนัส / คอม / อื่นๆ ฝากเต็มจำนวนตามช่องที่เลือก
5. ก่อนบันทึก แสดง **สรุปแจกแจง** ว่าจะฝากอะไรเข้าบัญชีไหนเท่าไหร่ ยืนยันแล้วจึงเขียน
6. Reconcile: แก้รายได้ย้อนหลัง → คืนยอดฝากเก่า แล้วลงยอดใหม่ (กลไก F34)

**Out of scope (YAGNI)**
- จัดกลุ่ม/สรุปยอดตามประเภทบัญชีในหน้าบัญชี — Tom เลือก "แค่ default กับป้าย"
- แยกโบนัสออกจาก Net. ในสูตรคำนวณ — สูตร `Net. = salary + bonus − deductions` ไม่เปลี่ยน (ดู §4 หมายเหตุ)
- ฝากอัตโนมัติย้อนหลังให้ข้อมูลเดิม — ข้อมูลเก่าไม่มี `deposits` = ไม่แตะยอดบัญชี

## 4. นิยามยอดฝาก

| ช่อง | ยอดที่ฝาก | เหตุผล |
|---|---|---|
| เงินเดือน | `salary − totalDeductions` | สลิปเงินเดือนหักภาษี/ประกันสังคม/กองทุน/กยศ/ลงทุน ก่อนโอนเข้าบัญชี |
| โบนัส | `bonus` เต็มจำนวน | Tom รับแยก (เงินสด/บัญชีอื่น) ตามที่เลือก |
| คอมมิชชั่น | `commission` เต็มจำนวน | เหมือนโบนัส |
| รายได้อื่นๆ | `otherIncome` เต็มจำนวน | เหมือนโบนัส |

**หมายเหตุความไม่สมมาตร (จงใจ):** สูตร `Net.` ในแอปคือ `salary + bonus − deductions` — โบนัสถูกนับรวมก่อนหัก แต่ยอดฝากเงินเดือนหักเต็มจำนวนจาก `salary` อย่างเดียว ถ้าเดือนไหน `deductions > salary` (โบนัสก้อนใหญ่ทำให้ภาษีเกินเงินเดือน) ยอดฝากจะติดลบ — **ระบบจะ clamp ที่ 0 และเตือนในสรุปก่อนบันทึก** ว่ายอดหักมากกว่าเงินเดือน ให้ตรวจสอบเอง ไม่เงียบ

**ไม่แตะสูตรคำนวณใดๆ** — `calculateNetAll`, KPI, ตารางสรุป ทำงานเหมือนเดิมทุกประการ ฟีเจอร์นี้เพิ่มเฉพาะ side-effect ไปที่ `bankAccounts`

## 5. Data model

```ts
// types/index.ts
export type BankAccountType = 'salary' | 'savings' | 'cash' | 'other';

export interface BankAccount {
  // ...เดิม
  /** ประเภทบัญชี — ใช้เลือก default ปลายทางเงินเดือน + badge บนการ์ด.
   *  Optional: บัญชีเดิมไม่มี field นี้ ถือเป็น 'other'. */
  type?: BankAccountType;
}

/** ปลายทางของรายได้แต่ละช่อง. undefined = ไม่ลงบัญชี. */
export interface IncomeDepositTargets {
  salary?: string;       // BankAccount.id
  bonus?: string;
  commission?: string;
  otherIncome?: string;
}

/** สิ่งที่เขียนลงบัญชีไปแล้วจริง — ใช้ revert ตอนแก้/ลบ. */
export interface IncomeDepositRef {
  source: 'salary' | 'bonus' | 'commission' | 'otherIncome';
  accountId: string;
  amount: number;
}

export interface MonthlyIncome {
  // ...เดิม
  deposits?: IncomeDepositTargets;
  /** Ref สำหรับ revert — เขียนโดย store เท่านั้น ห้ามแก้จากฟอร์ม. */
  depositSideEffects?: IncomeDepositRef[];
}
```

**Backward-compat:** ทั้งสาม field optional ข้อมูลเดิมไม่มี → ไม่มีการฝาก ยอดบัญชีเท่าเดิมเป๊ะ

**ทำไมต้องเก็บ `depositSideEffects` ไม่คำนวณใหม่ตอน revert:** ยอดที่เคยฝากอาจคำนวณจาก `salary`/`deductions` ชุดเก่า ถ้า revert ด้วยยอดที่คำนวณจากค่าใหม่ ยอดบัญชีจะเพี้ยน — เป็นบทเรียนเดียวกับ `ExpenseSideEffectRefs` ของ F34

## 6. Store

`src/utils/incomeDeposits.ts` (ใหม่ · pure):

```ts
/** ยอดฝากที่ควรเกิดจากรายได้ก้อนนี้ — clamp ที่ 0, ข้ามช่องที่ไม่เลือกบัญชี. */
export const computeIncomeDeposits = (income: MonthlyIncome): IncomeDepositRef[]

/** true เมื่อ salary − totalDeductions < 0 — UI เตือนก่อนบันทึก. */
export const isSalaryUnderwater = (income: MonthlyIncome): boolean
```

`addIncome` / `updateIncome` ใน `financeStore.ts`:
1. revert ทุก ref ใน `depositSideEffects` เดิม (`applyBankDelta(accounts, id, y, m, −amount)`)
2. คำนวณ refs ใหม่จาก income หลัง patch
3. apply refs ใหม่ (`+amount`)
4. เก็บ refs ใหม่ลง `depositSideEffects`

ใช้ `applyBankDelta` ที่มีอยู่แล้ว (F34) — ไม่เขียน helper ใหม่ซ้ำ
แก้ deductions อย่างเดียวก็ต้อง reconcile ด้วย เพราะยอดฝากเงินเดือนขึ้นกับมัน

## 7. UI

**`BankAccountForm`** — dropdown "ประเภทบัญชี" (เงินเดือน / ออมทรัพย์ / เงินสด / อื่นๆ) default `'other'`
**`BankAccountCard`** — badge เล็กบอกประเภท (เช่น `💼 เงินเดือน`) แสดงเมื่อ `type != null && type !== 'other'`

**`IncomeForm`** — ใต้ทุกช่องรายได้มี dropdown "เข้าบัญชี" ตัวเล็ก
- ตัวเลือก: `— ไม่ลงบัญชี —` + ทุกบัญชี
- Default ตอนสร้างเดือนใหม่: `salary` → บัญชีแรกที่ `type === 'salary'`; ช่องอื่น → `— ไม่ลงบัญชี —` (ไม่เดาแทนผู้ใช้)
- ถ้ายังไม่มีบัญชีสักอัน → ซ่อน dropdown ทั้งหมด

**สรุปก่อนบันทึก (บังคับ):** กด "บันทึก" → modal แจกแจง

```
จะบันทึกรายได้เดือน ก.ค. 2026 และฝากเงินเข้าบัญชี:
  เงินเดือน ฿80,000 − หัก ฿20,000  →  กสิกรไทย (เงินเดือน)   +฿60,000
  โบนัส ฿50,000                    →  เงินสด                +฿50,000
  คอมมิชชั่น ฿120,000              →  ไม่ลงบัญชี                  —
  รวมเข้าบัญชี ฿110,000
```
- ไม่มีช่องไหนเลือกบัญชี → ข้าม modal บันทึกตรงๆ (ไม่กวนผู้ใช้ที่ไม่ใช้ฟีเจอร์นี้)
- `isSalaryUnderwater` → แถบเตือนสีเหลืองใน modal: *"ยอดหักมากกว่าเงินเดือน — จะฝาก ฿0"*
- โหมดแก้ไข: modal บอกส่วนต่าง (`ยอดฝากเดิม ฿60,000 → ใหม่ ฿62,000`)

## 8. Verification — `scripts/verify-income-deposit.ts`

1. `computeIncomeDeposits`: เงินเดือน 80,000 หัก 20,000 → ref `salary` 60,000
2. ช่องที่ไม่เลือกบัญชี → ไม่มี ref
3. `deductions > salary` → ยอดฝาก 0 (ไม่ติดลบ) + `isSalaryUnderwater === true`
4. store: `addIncome` พร้อม deposits → ยอดบัญชีเพิ่มตามยอด, `depositSideEffects` ถูกเขียน
5. store: `updateIncome` แก้เงินเดือน → บัญชีถูก revert แล้ว apply ใหม่ (ไม่บวกซ้ำ)
6. store: `updateIncome` แก้เฉพาะ `deductions` → ยอดฝากเงินเดือนเปลี่ยนตาม
7. store: `updateIncome` ย้ายโบนัสจากบัญชี A → B → A ลด, B เพิ่ม, ผลรวมคงที่
8. store: เอาบัญชีออกจากช่อง (`undefined`) → ยอดที่เคยฝากถูกคืน
9. ข้อมูลเดิมไม่มี `deposits` → `addIncome`/`updateIncome` ไม่แตะ `bankAccounts` เลย
10. Export/Import round-trip เก็บ `type` / `deposits` / `depositSideEffects`
11. Regression: `verify-income-totals.ts` (netAll ทุกปีของ seed) ยังผ่าน — สูตรไม่เปลี่ยน
12. Regression: `verify-bank-accounts.ts`, `verify-expense-payment.ts` ยังผ่าน — ใช้ `applyBankDelta` ตัวเดียวกัน

บวก `npm run typecheck` + `npm run lint` + `npm run build` + verify เดิมทั้ง 13 ตัว + ขับ UI จริง (กรอกรายได้ → ดู modal สรุป → ยืนยัน → ยอดบัญชีขยับ → แก้ยอด → ยอดไม่บวกซ้ำ)
