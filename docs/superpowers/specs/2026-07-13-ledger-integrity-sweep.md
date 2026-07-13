# F45 — Ledger Integrity Sweep (ปิดแพทเทิร์น "ลืมเก็บกวาดสิ่งที่ชี้มา" ให้ครบทุกประตู)

> สถานะ: **เสร็จ** (2026-07-13)
> ต่อจาก F44 (deleteIncome + deleteBankAccount) — กวาดแพทเทิร์นเดียวกันให้ทั่วระบบ

## แพทเทิร์นเดียวที่ร้อยทุกบั๊กเข้าด้วยกัน

**การเปลี่ยนแปลง (ลบ/แก้/นำเข้า) ที่ลืมเก็บกวาดสิ่งที่ชี้มาหามัน** → เงินในบัญชี
เพี้ยนเงียบ ๆ + รายการเดินบัญชีกำพร้าที่ผู้ใช้ลบเองไม่ได้ (deleteBankTransaction
ปฏิเสธ source income/expense/gold)

WealthLens มี "ประตู" ที่ข้อมูลเข้า/เปลี่ยนได้ 4 บาน — บั๊กกระจายทั้ง 4:

| ประตู | บั๊ก | commit |
|---|---|---|
| delete | deleteIncome ไม่คืนเงินฝาก | be50684 (F44) |
| delete | deleteBankAccount ทิ้ง pointer กำพร้า | dd8a33f (F44) |
| delete | deleteLoan / deleteExtraPayment ไม่คืนยอดรายจ่ายผูก | 2e1cce6 |
| restore | backup ตัวเอง import กลับไม่ได้ (หมวด gold) | da0c3c0 |
| restore | replaceAllData ทิ้งสมุดรายการ (ไม่ lock-step) | 22492dc |
| import | validateBackup รับ pointer กำพร้า + array ขยะ | c62a1ce |
| mutate | รายจ่าย legacy (sideEffects ไม่มีบรรทัด) ลบ/แก้ยอดเพี้ยน | 7d11d33 |

## รายละเอียดแต่ละบั๊ก (ส่วนที่ไม่อยู่ใน F44)

### 2e1cce6 — deleteLoan / deleteExtraPayment
ลบ ExpenseItem ที่ตัวเองสร้าง (โปะหนี้ + createExpenseEntry) ด้วย `filter(row.items)`
ตรง ๆ ไม่ผ่าน reconcileExpenseLedger เหมือน deleteExpense → รายจ่ายที่ผูกบัญชีจ่าย
ถูกลบแต่เงินไม่คืน + tx กำพร้า. แก้: เก็บ item ก่อนลบ แล้ว revoke ผ่าน ledger
(deleteLoan reduce หลายโปะเข้า ledger เดียว)

### da0c3c0 — หมวด gold หายจาก validator
`VALID_SAVINGS_CATEGORIES` ขาด 'gold' ทั้งที่ store สร้างเองทุกครั้งที่ซื้อทอง
ด้วยเงินสด. validate ล้ม = **ปฏิเสธทั้งไฟล์** เส้นทางกู้ข้อมูลทั้งสอง (Import JSON +
F28 restore) ใช้ validateBackup ตัวเดียวกัน Drive sync ไม่ validate → เงียบสนิท
พังเฉพาะวันกู้จริง. **ยืนยันกับไฟล์จริงของ Tom: มี gold savings 5 รายการ →
validate ok:false ก่อนแก้**. กันเกิดซ้ำ: เปลี่ยนเป็น Record<SavingsCategory,true>
→ เพิ่มหมวดใหม่แล้วลืม = typecheck แดง

### 22492dc — replaceAllData ไม่ lock-step
bankAccounts มี fallback 3 ชั้น (payload→migrate→local) แต่ bankTransactions มา
จาก ...data ตรง ๆ → restore backup เก่าไม่มี bankAccounts: บัญชี local ยังอยู่
(ยอด) แต่สมุด undefined = บัญชีมียอดไม่มีรายการรองรับ. mergeData ทำ lock-step
ถูกแล้ว — ให้ replaceAllData ทำตาม. เจอ edge เพิ่ม: ...data spread พา
bankTransactions ผีเข้ามาค้าง → destructure bank fields ออก set แบบ deterministic

### c62a1ce — validateBackup ไม่ตรวจ 2 อย่าง
- array member: bankAccounts/bankTransactions เช็คแค่ Array.isArray →
  [42,null,'nope'] ผ่านแล้วจอขาว. เพิ่ม validateBankAccount/BankTransaction
- referential: pointer (tx.accountId, deposits, paymentAccountId, loanId, gold
  sideEffects) ชี้ของที่ไม่มี → ผ่าน ok:true. เพิ่มด่านตรวจ
- conservative: known accounts รวม acct-krungsri ที่จะ migrate จาก keptBalances;
  gold ref ไม่มี accountId (legacy) ข้าม. **acceptance บังคับ: ไฟล์จริงของ Tom
  ผ่าน** (มี gold savings + deposits + loans)

### 7d11d33 — รายจ่าย legacy (F34→F40)
มี sideEffects (หักนอกสมุด) แต่ไม่มีบรรทัด → reconcileExpenseLedger revoke เจอ 0
→ ลบไม่คืน, แก้หักซ้ำ. ทองมี addRawBalance รับเคสนี้ (F25) รายจ่ายไม่มี. เพิ่ม
oldDeduction param: ไม่มีบรรทัด + มี oldDeduction → คืนนอกสมุดก่อน (mirror gold)
แล้ว apply ใหม่; มีบรรทัด → เชื่อบรรทัด (source of truth). เซลล์ผสมหลังแก้ =
F40 design (บรรทัด virtual 'ยอดก่อนมีรายการ') เงินไม่หาย (balance − Σtx = opening)

## วิธีทำงาน (ยึดตลอด session)

1. **reproduce ก่อนเชื่อ** — subagent audit รายงาน ผมรัน probe จริงยืนยันเองทุกข้อ
   ก่อนแตะโค้ด (จับ false-positive ของ subagent ได้: deleteExpense ถูกกล่าวหาผิด
   เพราะ probe ส่ง id ที่ store ไม่ใช้)
2. **TDD เข้ม** — เขียน verify แดงก่อนทุกบั๊ก (แดง 11/4/6/2/1/10/3 ตามลำดับ)
3. **ยืนยันกับข้อมูลจริง** — ตรวจ wealthlens_data.json บน Drive (อ่านอย่างเดียว)
   ทุกจุดที่เกี่ยวข้อง; acceptance test บังคับไฟล์จริงต้องผ่าน validator ใหม่
4. **ขับ UI จริง** — deleteIncome/deleteBankAccount ขับใน Chrome กับข้อมูลจริง
   แล้วคืนสภาพ (เทียบ snapshot ทุกเซลล์)

## สภาพข้อมูลจริงของ Tom

ตรวจแล้ว: **ไม่มีบั๊กตัวไหนทำข้อมูลจริงเสียหาย** — 32 bankTransactions เป็น
backfill ล้วน (F41), ไม่มีรายจ่าย/รายได้ที่มี sideEffects/depositSideEffects
(ยังไม่เคยใช้ F34/F39 กับข้อมูลจริง). ทุกบั๊กถูกจับก่อนทำเงินจริงเพี้ยน →
ไม่ต้อง migration. gold savings 5 รายการเป็นตัวเดียวที่ da0c3c0 กระทบ (backup
กู้ไม่ได้) แต่เงินไม่เพี้ยน แค่กู้ไม่ได้ — แก้แล้ว

## verify เดิมที่ต้องแก้ (ไม่ใช่ regression)

referential check (c62a1ce) ทำ verify เดิม 4 ตัวแดง (income-deposit,
expense-payment, expense-loan-link, journal-backfill) — เพราะเขียน payload
minimal ที่ pointer ชี้บัญชี/หนี้ไม่ครบ (store จริงไม่มีวันสร้าง ref ชี้บัญชี
ที่ไม่มี). แก้ให้ payload สมจริง เติมปลายทางให้ resolve — ไม่ถอย check

## verify scripts ใหม่ (7 ไฟล์)

verify-delete-income (25) · verify-delete-bank-account (20) ·
verify-loan-expense-revert (16) · verify-backup-categories ·
verify-replace-lockstep · verify-import-integrity · verify-legacy-expense-deduction
รวม verify suite 19 → 26 ตัว
