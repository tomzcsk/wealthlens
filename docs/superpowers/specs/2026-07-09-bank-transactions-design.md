# F40 — รายการเดินบัญชี (Bank Transaction Journal)

*Design · 2026-07-09*

## 1. ปัญหา

ยอดบัญชีเก็บเป็นตัวเลขสุทธิต่อเดือน (`BankAccount.balances[ปี][เดือน]`) มันบอกว่า *เท่าไหร่* แต่ไม่เคยบอกว่า *ทำไม* — เดือน ก.ค. ขึ้น ฿17,250 มาจากเงินเดือน? โอนมา? ขายทอง? เปิดดูไม่ได้

ยิ่งกว่านั้น มี **5 จุดในโค้ดที่เขียนยอดนี้ได้อย่างอิสระ**: ฝาก/ถอน/โอนด้วยมือ, รายจ่ายจ่ายผ่านบัญชี (F34), งวดผ่อน (F35), ทองซื้อด้วย Kept (F25), รายได้ฝากอัตโนมัติ (F39) ต่างคนต่างเรียก `applyBankDelta` ไม่มีใครจดว่าเกิดอะไรขึ้น

## 2. เป้าหมาย

ทุกการขยับเงินจดเป็นบรรทัดหนึ่ง: *วันไหน · อะไร · เข้าหรือออก · เท่าไหร่ · บัญชีไหน* และ **บรรทัดต้องตรงกับยอดเสมอ** — แก้เงินเดือนแล้วบรรทัดเงินเดือนเปลี่ยนตาม ไม่ใช่เพิ่มบรรทัดใหม่ทับ

## 3. หลักการออกแบบ: ประตูเดียว

ปัญหาที่แท้จริงไม่ใช่ "ไม่มีที่เก็บรายการ" แต่คือ **ยอดถูกเขียนจากหลายที่** ถ้าเพิ่ม journal แล้วยังปล่อยให้ 5 จุดเรียก `applyBankDelta` ตรงๆ ต่อไป ไม่ช้าก็เร็วยอดกับรายการจะไม่ตรง แล้วจะแก้ไม่จบ

ทางแก้: **ทุกการขยับเงินไหลผ่านฟังก์ชันเดียว** ที่ปรับยอด *และ* จดบรรทัดในคราวเดียว เป็นไปไม่ได้ที่จะทำอย่างหนึ่งโดยลืมอีกอย่าง

```
บันทึกรายได้ ─┐
จ่ายผ่านบัญชี ─┤
ซื้อทองด้วย Kept ─┼──▶ applyBankMovement() ──▶ balances[]  +  transactions[]
ฝาก/ถอน/โอน ─┤                                (เขียนพร้อมกันเสมอ)
ปรับยอดเอง ──┘
```

**กฎที่ตรวจสอบได้ (invariant):** สำหรับทุก (บัญชี, ปี, เดือน) ที่ **มีรายการอย่างน้อยหนึ่งบรรทัด** → `Σ tx.amount === balances[ปี][เดือน]` เป๊ะ verify script บังคับกฎนี้หลังทุก action

เดือนเก่าที่ไม่มีรายการเลยได้รับการยกเว้น — นั่นคือความหมายของ "เริ่มแค่ของใหม่"

## 4. ขอบเขต

**In scope**
1. `WealthLensData.bankTransactions?: BankTransaction[]` (optional, backward-compat)
2. `applyBankMovement()` — ประตูเดียวที่เขียนทั้งยอดและรายการ
3. rewire 5 จุด: manual ฝาก/ถอน/โอน · setBankBalance (→ 'ปรับยอดเอง') · F34/F35 รายจ่าย · F25 ทอง · F39 รายได้
4. reconcile: แก้/ลบต้นทาง → บรรทัดของมันถูกแทนที่หรือลบ (ไม่เพิ่มบรรทัดใหม่)
5. UI: กางแถวเดือนในหน้าบัญชี → เห็นรายการของเดือนนั้น
6. `scripts/verify-bank-transactions.ts` — บังคับ invariant ข้อ 3

**Out of scope (YAGNI)**
- migrate เดือนเก่าเป็นรายการ "ยอดยกมา" — Tom เลือก "โชว์ยอดเฉยๆ กางไม่มีรายละเอียด"
- ทำ transactions เป็น source of truth ของยอด (ทางเลือก B) — journal ที่สะสมไว้จะเป็นข้อมูลตั้งต้นถ้าวันหนึ่งจะย้าย
- หน้ารายการรวมทุกบัญชี / ค้นหา / กรอง — เริ่มจากในแถวเดือนก่อน

## 5. Data model

```ts
/** ที่มาของรายการ — ใช้ทั้งแสดงผลและ reconcile (ลบ/แทนที่บรรทัดเดิม). */
export type BankTxSource =
  | { type: 'manual' }                                   // ฝาก/ถอน กดเอง
  | { type: 'adjustment' }                               // แก้ยอดเดือนด้วยมือ
  | { type: 'transfer'; counterpartAccountId: string }   // ขาคู่ของการโอน
  | { type: 'income'; year: number; month: number; field: 'salary' | 'bonus' | 'commission' | 'otherIncome' }
  | { type: 'expense'; expenseId: string }               // F34/F35
  | { type: 'gold'; holdingId: string };                 // F25

export interface BankTransaction {
  id: string;                    // uuid
  accountId: string;
  /** bucket เดียวกับ balances — แหล่งความจริงของ "อยู่เดือนไหน". */
  year: number;
  month: number;
  /** ISO yyyy-mm-dd ถ้ารู้วันจริง (รายจ่ายมี date, เงินเดือนไม่มี). */
  date?: string;
  /** + เข้าบัญชี, − ออกจากบัญชี. ห้ามเป็น 0. */
  amount: number;
  /** ข้อความที่ผู้ใช้อ่าน เช่น "เงินเดือน (หลังหัก)", "ค่าบ้าน", "โอนไป เงินสด". */
  label: string;
  source: BankTxSource;
}
```

**ทำไม `year`/`month` ไม่ derive จาก `date`:** `balances` bucket ตาม (ปี, เดือน) ที่ผู้ใช้เลือก ไม่ใช่วันที่จริงเสมอ (F37 เรียนบทเรียนนี้มาแล้ว) ถ้า derive จาก date รายการจะหลุด bucket แล้ว invariant พัง

**ทำไม `source` เป็น discriminated union ไม่ใช่ string + refId:** เพราะแต่ละที่มามีคีย์ต่างกัน — รายได้ระบุด้วย (ปี, เดือน, ช่อง) ส่วนรายจ่ายระบุด้วย `expenseId` ถ้ายัดเป็น `refId: string` ตัวเดียวจะต้องมานั่งเดารูปแบบ string ทีหลัง

## 6. `src/utils/bankMovements.ts` (ใหม่ · pure)

```ts
export interface BankMovement {
  accountId: string;
  year: number;
  month: number;
  amount: number;          // + เข้า, − ออก
  label: string;
  source: BankTxSource;
  date?: string;
  /** id คงที่สำหรับ tx (ทำให้ apply ซ้ำได้ผลเท่าเดิม); เว้นว่าง = uuid ใหม่. */
  id?: string;
}

export interface BankLedger {
  accounts: BankAccount[];
  transactions: BankTransaction[];
}

/**
 * ประตูเดียวที่ยอดและรายการถูกเขียน — เป็นไปไม่ได้ที่จะปรับยอดโดยลืมจดรายการ.
 * `revoke` ลบบรรทัดเดิมของ source นั้นและคืนยอดก่อน แล้วค่อยลงรายการใหม่.
 */
export const applyBankMovement = (ledger: BankLedger, movement: BankMovement): BankLedger;

/** ลบทุกบรรทัดที่ตรงกับ predicate พร้อมคืนยอดที่เคยลง (revert). */
export const revokeBankMovements = (
  ledger: BankLedger,
  match: (tx: BankTransaction) => boolean,
): BankLedger;

/** reconcile: ลบของเก่าที่ตรง match แล้วลงชุดใหม่ — ใช้กับทุกการแก้ไข. */
export const reconcileBankMovements = (
  ledger: BankLedger,
  match: (tx: BankTransaction) => boolean,
  movements: readonly BankMovement[],
): BankLedger;

/** ตรวจ invariant — ใช้ใน verify script. */
export const findLedgerMismatches = (ledger: BankLedger): Array<{
  accountId: string; year: number; month: number; balance: number; txSum: number;
}>;
```

`amount === 0` → ไม่สร้างบรรทัด (เหมือน F39 ที่ไม่เขียน delta 0)

## 7. Store — rewire ทั้ง 5 จุด

| จุด | match ที่ใช้ reconcile | label |
|---|---|---|
| `depositBank` / `withdrawBank` (manual) | — (append) | "ฝากเงิน" / "ถอนเงิน" |
| `setBankBalance` | `source.type === 'adjustment'` เดือนนั้น | "ปรับยอดเอง" |
| `transferBankBalance` | — (append 2 บรรทัด) | "โอนไป X" / "โอนจาก Y" |
| `addExpense` / `updateExpense` / `deleteExpense` (F34/F35) | `source.type === 'expense' && expenseId === id` | ชื่อรายจ่าย |
| `addGoldHolding` / `deleteGoldHolding` (F25) | `source.type === 'gold' && holdingId === id` | "ซื้อทอง" / "ขายทอง" |
| `addIncome` / `updateIncome` (F39) | `source.type === 'income' && ปี/เดือนตรง` | "เงินเดือน (หลังหัก)" / "โบนัส" / … |

`clearBankBalance` → `revokeBankMovements` ทุกบรรทัดของเดือนนั้น + ลบยอด

**`setBankBalance` (ปุ่ม "ใส่ยอด / แก้ยอด"):** เดือนที่ **มีรายการอยู่แล้ว** → คำนวณส่วนต่าง `ยอดใหม่ − Σ tx อื่น` แล้วลงเป็นบรรทัด `adjustment` เดียว (แทนที่ของเดิมถ้ามี) เพื่อให้ invariant ยังจริง เดือนที่ **ไม่มีรายการเลย** → เขียนยอดตรงๆ ไม่สร้างบรรทัด (พฤติกรรมเดิมของเดือนเก่า)

**`depositSideEffects` / `sideEffects` เดิม (F34/F39) ยังอยู่** — ไม่ลบ เพราะยอดที่ต้อง revert คือยอดที่ *เคยฝากจริง* และตอนนี้ `transactions` เก็บข้อมูลเดียวกัน. **ทางเลือกที่ปฏิเสธ:** ลบ `depositSideEffects` แล้วหา revert amount จาก transactions — ทำได้ แต่รื้อ F34/F39 ที่เพิ่ง verify เสร็จ ความเสี่ยงต่อยอดเงินจริงสูงเกินกว่าที่ได้กลับมา ทำทีหลังได้

## 8. UI

**`BankAccountDetail`** — แถวเดือน (ตามภาพของ Tom) กดกางได้:
- มีรายการ → ตารางย่อย: `วันที่ · รายการ · ↑/↓ · จำนวน` เรียงเก่า→ใหม่ ปิดท้ายด้วยแถว "รวม" ที่เท่ากับยอดเดือน
- ไม่มีรายการ (เดือนเก่า) → ข้อความจางๆ *"ยอดที่กรอกไว้ ไม่มีรายละเอียดรายการ"*
- แถวเดือนแสดงจำนวนรายการเป็น badge เล็ก เช่น `3 รายการ`
- รายการที่มาจากต้นทาง (income/expense/gold) **แก้ตรงนี้ไม่ได้** — แสดงป้ายบอกที่มา (`💰 รายได้`, `🧾 รายจ่าย`, `🪙 ทอง`) และลิงก์ไปหน้าต้นทาง เพราะแก้ที่นี่จะทำให้ต้นทางกับ journal ไม่ตรง
- รายการ `manual` / `transfer` / `adjustment` ลบได้ (revoke + คืนยอด)

## 9. Verification — `scripts/verify-bank-transactions.ts`

**Invariant หลัก (รันหลังทุกเคส):** `findLedgerMismatches(ledger).length === 0`

1. ฝากมือ ฿1,000 → 1 บรรทัด `manual` +1000, ยอด +1000
2. โอน A→B ฿500 → 2 บรรทัด (`transfer` คู่กัน), ยอด A −500, B +500, ผลรวมระบบคงที่
3. `addIncome` เงินเดือน 80,000 หัก 20,000 ลงบัญชีเงินเดือน → 1 บรรทัด "เงินเดือน (หลังหัก)" +60,000
4. **แก้เงินเดือนเป็น 90,000 → บรรทัดเดิมถูกแทนที่เป็น +70,000 ไม่ใช่มี 2 บรรทัด** (นี่คือสิ่งที่ Tom ขอ)
5. ถอดบัญชีออกจากช่องเงินเดือน → บรรทัดหาย ยอดคืน
6. รายจ่ายจ่ายผ่านบัญชี → บรรทัด −amount; แก้ยอดรายจ่าย → บรรทัดเปลี่ยนตาม; ลบรายจ่าย → บรรทัดหาย
7. ทองซื้อด้วย Kept → บรรทัด − ที่บัญชีกรุงศรี; ลบ holding → คืน
8. `setBankBalance` ในเดือนที่มีรายการ → เกิดบรรทัด `adjustment` เท่ากับส่วนต่าง, invariant ยังจริง
9. `setBankBalance` ในเดือนที่ไม่มีรายการ → ไม่เกิดบรรทัด (เดือนเก่าไม่ถูกยุ่ง)
10. `clearBankBalance` → รายการเดือนนั้นหายหมด ยอดหาย
11. amount 0 → ไม่สร้างบรรทัด
12. ข้อมูลเดิมไม่มี `bankTransactions` → ทุก action ทำงานได้, ยอดเท่าเดิม (backward-compat)
13. Export/Import round-trip เก็บ `bankTransactions`
14. Regression: `verify-bank-accounts` · `verify-expense-payment` · `verify-installment-deduction` · `verify-income-deposit` · `verify-net-worth` ผ่านหมด (ยอดบัญชีไหลไปถึงหน้าความมั่งคั่ง)

บวก `npm run typecheck` + `npm run lint` + `npm run build` + ขับ UI จริง (กรอกเงินเดือน → กางเดือนเห็นบรรทัด → แก้เงินเดือน → บรรทัดเปลี่ยน ไม่เพิ่ม)
