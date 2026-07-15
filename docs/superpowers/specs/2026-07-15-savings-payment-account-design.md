# F53 — รายการออมระบุ "จ่ายผ่าน" บัญชีได้ (หักยอดจริง เหมือนรายจ่าย)

**วันที่:** 2026-07-15 · **สถานะ:** อนุมัติดีไซน์แล้ว รอ implement

## ปัญหา

รายการออม/ลงทุน (`SavingsItem`) ระบุไม่ได้ว่าเงินออกจากบัญชีไหน ทั้งที่รายจ่าย
(`ExpenseItem`) มี `paymentAccountId` + หักยอดผ่าน ledger มานานแล้ว ผลคือออมเดือนละ
฿200,000 เข้า Dime แต่ยอดบัญชีต้นทางไม่ขยับ — net worth ฝั่งบัญชีธนาคารสูงเกินจริง

## ขอบเขต

ทำ: dropdown "จ่ายผ่าน" ใน `SavingsForm` + หักยอด/คืนยอดอัตโนมัติครบวงจร add/edit/delete
ไม่ทำ: migrate รายการออมเก่า (ผู้ใช้ไปกดแก้เองทีละรายการถ้าอยากผูก), ไม่มี field วันที่ใน savings
(บรรทัดใน ledger ใช้ bucket ปี/เดือนของแถวออม, `date` ไม่ใส่)

## แนวทางที่เลือก: ลอกแพทเทิร์นรายจ่าย + generalize reconcile helper

logic reconcile ของ savings เหมือน expense 100% ต่างแค่ discriminant key ของ tx
จึง **generalize `reconcileExpenseLedger` (financeStore.ts:318) เป็น helper กลาง**
ที่รับ matcher/source แล้วให้ทั้งสองเส้นทางเรียก — ไม่ก๊อป logic สองชุด
(ทางเลือกที่ตัดทิ้ง: เขียน `reconcileSavingsLedger` แยก = โค้ดซ้ำ; แปลงออมเป็น expense
เบื้องหลัง = พังความหมาย "ออมไม่ใช่ค่าใช้จ่าย")

## การเปลี่ยนแปลง

### 1. Types (`src/types/index.ts`)

- `SavingsItem` เพิ่ม (mirror `ExpenseItem:270`):
  ```ts
  /** บัญชีที่จ่ายรายการออมนี้. ไม่ระบุ = ไม่หักบัญชี. */
  paymentAccountId?: string;
  /** Ref เพื่อ revert การหักยอดบัญชี (store เขียนเท่านั้น form ห้ามแตะ). */
  sideEffects?: SavingsSideEffectRefs;
  ```
  `SavingsSideEffectRefs` โครงเดียวกับ `ExpenseSideEffectRefs` (accountId, deductYear,
  deductMonth, deductAmount) — ประกาศแยก type ไม่ reuse ตรง เพื่อให้สอง flow วิวัฒน์อิสระ
- `BankTxSource` (index.ts:658) เพิ่ม variant:
  ```ts
  | { type: 'savings'; savingsId: string }
  ```
  บรรทัด savings: `amount` ติดลบเสมอ, `label` = ชื่อรายการออม
- ทั้งสอง field เป็น optional → **ข้อมูลเก่าไม่ต้อง migrate**, backward-compat ทั้ง
  LocalStorage และไฟล์ backup JSON (validator ใน `exportImport.ts` เช็คแค่ `source.type`
  เป็น string อยู่แล้ว — ไม่ต้องแก้)

### 2. Store (`src/stores/financeStore.ts`) — กฎ F49: ทุกทางจบที่ `ledgerPatch()`

- Generalize `reconcileExpenseLedger` → helper กลาง (ชื่อแนว `reconcileItemLedger`)
  รับ `(ledger, source: BankTxSource, oldDed, newDed, label)` — revoke บรรทัดเก่าด้วย
  `tx.amount` ที่เก็บไว้จริง (ห้ามคำนวณใหม่) แล้ว apply บรรทัดใหม่ยอดติดลบ
  ผ่าน `reconcileBankMovements` เดิม. เส้นทาง expense เดิมเรียก helper นี้ผ่าน
  wrapper ที่พฤติกรรมเท่าเดิมทุกประการ (มี legacy pre-F40 inline path อยู่ — ต้องคงไว้)
- เพิ่ม `savingsDeductionOf(item, year, month)` mirror `expenseDeductionOf` (fs:257)
- `addSavings` / `updateSavings` / `deleteSavings` (fs:2288/2314/2344) ต่อท่อ
  `withLedger` + reconcile เหมือนสามตัวของ expense เป๊ะ:
  - add: มี `paymentAccountId` → เซ็ต `sideEffects` + หักยอด
  - update: recompute deduction จากค่าใหม่ (เปลี่ยนจำนวน/เปลี่ยนบัญชี/ถอดบัญชี)
    revoke เก่า → apply ใหม่; ถอดบัญชี = `delete merged.sideEffects`
  - delete: revoke บรรทัด → ยอดคืนอัตโนมัติ (ติดลบได้ ห้าม clamp — Design Decision 8)
  - ทุกตัว guard `state.data.bankAccounts !== undefined` เหมือน expense
- `deleteBankTransaction` (fs:2197): เพิ่ม `'savings'` ใน guard list — บรรทัดจากรายการออม
  ห้ามลบตรงจากสมุด ต้องไปลบที่ต้นทาง

### 3. จุดเสี่ยงที่ต้องอุด

- **F44 — ห้ามลบบัญชีที่มีต้นทางผูก** (`src/utils/bankAccountUsage.ts`):
  `BankAccountUsage` เพิ่ม `savings: readonly string[]` (เก็บ id รายการออมที่
  `paymentAccountId === accountId || sideEffects?.accountId === accountId`),
  `findBankAccountUsage` กวาด `year.savings` เพิ่ม, `isBankAccountDeletable`
  เช็ค `usage.savings.length === 0` ด้วย. UI ที่โชว์เหตุผลบล็อกต้องนับ savings ด้วย
  (ไล่จากผู้บริโภค `findBankAccountUsage`)
- **รายการออมที่ทองสร้างเอง** (ซื้อทอง 'cash' → auto-สร้าง `SavingsItem` category 'gold'):
  `deleteGoldHolding` (fs:1345-1360) ลบ item นั้น **inline ไม่ผ่าน `deleteSavings`** —
  ถ้าผู้ใช้เคยแก้ item นั้นให้ผูกบัญชีไว้ การลบ inline จะทิ้งยอดหักค้าง.
  แก้: ตรงจุดลบ inline นั้น revoke บรรทัด `{type:'savings', savingsId}` ของ item
  ที่ถูกลบด้วย (ผ่าน `withLedger` + `revokeBankMovements` — pattern เดียวกับที่
  function นี้ใช้กับ gold tx อยู่แล้ว)
- **`SOURCE_BADGE`** (`src/components/accounts/MonthTransactionList.tsx:19`) เป็น
  `Record` ครบทุก source type — TypeScript จะ error จนกว่าจะเพิ่ม badge ของ `'savings'`
  (ตั้งชื่อ badge "ออม"). **ห้าม**เพิ่มใน `DELETABLE`

### 4. Form (`src/components/forms/SavingsForm.tsx`)

- เพิ่ม dropdown "จ่ายผ่าน" ใต้ช่องจำนวนเงิน — ลอก `ExpenseForm.tsx:430-450`:
  `<select>` ตัวเลือกแรก `"" = ไม่ระบุ (ไม่หักบัญชี)` ตามด้วยทุกบัญชี
- อ่านบัญชีผ่าน `useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS)`
- ส่งเข้า store เป็น `paymentAccountId: paymentAccountId || undefined`
- form ไม่แตะ `sideEffects` เด็ดขาด (store เขียนเท่านั้น)
- สไตล์: ใช้ class เดิมของ form (token สีเท่านั้น — F46) ไม่มีสไตล์มือถือใหม่
  (ช่อง select เดิมผ่านกฎ M1–M6 อยู่แล้ว)

## Invariants ที่ต้องคงอยู่

1. Σ tx ของบัญชีในเดือนใด === ค่าใน `balances[ปี][เดือน]` (F40)
2. ทุกการเขียน `bankAccounts` จบที่ `ledgerPatch()` (F49) — เซลล์ 0 กำพร้าถูกกวาด,
   เซลล์ 0 ที่มีรายการรองรับต้องอยู่ต่อ
3. ยอดติดลบได้ ห้าม clamp (F44/Decision 8)
4. `รวมออม` และตัวเลขหน้า dashboard เดิมไม่เปลี่ยน — การผูกบัญชีไม่กระทบยอดออม
   กระทบแค่ยอดบัญชีธนาคาร

## Testing

Unit tests (Vitest — ไฟล์ test ของ store เดิม):
1. add ออม + บัญชี → ยอดลด, tx `{type:'savings'}` ยอดติดลบเกิด, Σ tx === ช่อง
2. add ออมไม่ระบุบัญชี → bank state ไม่ขยับเลย (reference เดิม)
3. update เปลี่ยนจำนวน → revoke เก่า apply ใหม่ (เหลือ tx เดียว ยอดถูก)
4. update ย้ายบัญชี A→B → A คืนยอด B โดนหัก
5. update ถอดบัญชีออก → คืนยอด, `sideEffects` หาย, tx หาย
6. delete → คืนยอด, tx หาย, แถวเดือน (ว่างได้) ยังอยู่
7. F44: บัญชีที่มีออมผูก → `isBankAccountDeletable` = false; ถอดออกแล้ว → ลบได้
8. gold: ซื้อทอง cash → แก้ savings item ให้ผูกบัญชี → `deleteGoldHolding`
   (revertSideEffects) → ยอดบัญชีคืนครบ ไม่มี tx ค้าง
9. `deleteBankTransaction` กับ tx source 'savings' → no-op
10. เซลล์ 0 กำพร้าจากการถอดบัญชี → ถูกกวาด (F49); เซลล์ 0 ที่มี tx อื่นรองรับ → อยู่ต่อ

Gate เดิมต้องเขียว: `npm run typecheck`, `npm run lint`, test suite ทั้งหมด
(mobile/analytics/pwa gates ไม่เกี่ยวกับ diff นี้ — รันเฉพาะถ้าแตะไฟล์ที่มันคุม)

## หลัง implement

- `features.json`: เพิ่ม F53 status `completed` + `completedAt` + acceptance criteria ตาม spec นี้
- CLAUDE.md: ไม่ต้องเพิ่มกฎใหม่ (อยู่ใต้กฎ F49 เดิมครบ)
