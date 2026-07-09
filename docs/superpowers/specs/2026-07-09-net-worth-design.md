# F38 — หน้าความมั่งคั่ง (Net Worth)

*Design · 2026-07-09*

## 1. ปัญหา

Tom อยากเห็น "ยอดทั้งหมด" ในที่เดียว วันนี้เงินของเขากระจายอยู่ 3 หน้า (🏦 บัญชีธนาคาร, 🪙 ทองคำ, การ์ดออมบน Overview) และหนี้อยู่อีกหน้า (💰 หนี้สิน) ไม่มีที่ไหนบอกว่าสุทธิแล้วเหลือเท่าไหร่

## 2. เป้าหมาย

หน้าเดียวที่ตอบว่า **สินทรัพย์ − หนี้ = เท่าไหร่** โดยไม่โกหกตัวเอง: ไม่รวมมูลค่าบ้าน/รถ (ไม่มีในระบบ) แต่ก็ไม่ซ่อนหนี้ของมัน — ติดป้ายให้ชัดแทน

## 3. ขอบเขต

**In scope**
1. `src/utils/netWorth.ts` — pure `computeNetWorth()` คืน breakdown ครบทั้งสองฝั่ง
2. หน้า `/wealth` (เมนู 💎 ความมั่งคั่ง) — read-only ล้วน
3. `scripts/verify-net-worth.ts`

**Out of scope (YAGNI)**
- `manualAssets[]` (กรอกมูลค่าบ้าน/รถเอง) — Tom เลือก "ไม่นับ ติดป้ายให้ชัด"
- กราฟ net worth ย้อนหลังรายเดือน — ต้อง reconstruct ยอดทุกก้อนย้อนหลัง (ราคาทองในอดีต, เงินต้นคงเหลือ ณ เดือนนั้น) คนละงาน
- แก้ schema ใดๆ — หน้านี้ derive ล้วน

## 4. นิยามตัวเลข

### สินทรัพย์

| แถว | สูตร | ป้ายที่ต้องแสดง |
|---|---|---|
| บัญชีธนาคาร | `sumBankAllTime(data.bankAccounts)` | "ยอดสะสมทุกปี" |
| ทองคำ | `marketValue` ถ้า > 0 มิฉะนั้น `totalInvested` | เมื่อ fallback → "ราคาทุน (ยังไม่ได้ตั้งราคาทอง)" |
| ออมสะสม | Σ `savings.items.amount` ทุกปีทุกเดือน **ยกเว้น `category === 'gold'`** | "เงินที่ใส่ไป ไม่ใช่มูลค่าปัจจุบัน" |

**ทำไมตัด `gold` ออกจากฝั่งออม:** `addGoldHolding` ที่จ่ายด้วยเงินสด dual-write `SavingsItem` หมวด `gold` ไว้แล้ว (`GoldHolding.sideEffects.savingsItemId`) ถ้าบวกทั้งสองทาง ทองจะถูกนับสองรอบ — เรานับจาก ledger ทางเดียวเพราะได้มูลค่าตลาดจริง

**ทำไมทองใช้ fallback:** `selectGoldSummary.marketValue` เป็น 0 เมื่อยังไม่ได้ตั้ง spot price ถ้าใช้ตรงๆ ทองที่ซื้อมา ฿338,290 จะหายไปจากสินทรัพย์ทั้งก้อน

### หนี้

| แถว | สูตร |
|---|---|
| หนี้ระยะยาว | Σ `getPrincipalRemaining(loan)` ต่อก้อน — **เงินต้นล้วน** ไม่รวมดอกเบี้ยที่ยังไม่เกิด |
| ผ่อนของ | Σ `plan.remainingAmount` ทุกแผนที่ยังไม่จบ |

Loans ต้องผ่าน `materializeLoanPayments` ก่อน (F37) ไม่งั้นรายจ่ายที่ผูกไว้จะไม่ถูกหัก — ใช้ `useResolvedLoans()` ที่มีอยู่

**ทำไมหนี้ระยะยาวใช้เงินต้น ไม่ใช่ `remaining` (ต้น+ดอก):** ดอกเบี้ยของงวดอนาคตยังไม่ใช่ภาระวันนี้ ถ้าโปะปิดพรุ่งนี้ก็ไม่ต้องจ่าย การเอา ฿3.67M มาหักจึงเกินจริง เงินต้น ฿3.05M คือหนี้ที่แท้

### สุทธิ

`netWorth = totalAssets − totalLiabilities` แสดงพร้อมป้าย **"ไม่รวมมูลค่าบ้านและรถ"** ใต้ตัวเลข ไม่ใช่ tooltip — คนที่เห็นเลขติดลบต้องเข้าใจทันทีว่าทำไม

## 5. `src/utils/netWorth.ts` (ใหม่ · pure, total)

```ts
export interface NetWorthLine {
  /** คีย์คงที่สำหรับ UI (ไม่ใช่ข้อความไทยที่อาจเปลี่ยน). */
  key: 'bank' | 'gold' | 'savings' | 'loans' | 'installments';
  amount: number;
  /** true เมื่อทองใช้ราคาทุนแทนราคาตลาด — UI ติดป้ายเตือน. */
  isCostBasis?: boolean;
}

export interface NetWorthBreakdown {
  assets: NetWorthLine[];
  liabilities: NetWorthLine[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** รายละเอียดต่อก้อน สำหรับ list ในหน้า. */
  loanDetails: ReadonlyArray<{ id: string; name: string; principalRemaining: number }>;
  savingsByCategory: ReadonlyArray<{ category: SavingsCategory; amount: number }>;
}

export const computeNetWorth = (
  data: WealthLensData,
  goldValue: { marketValue: number; totalInvested: number },
  resolvedLoans: readonly Loan[],
  installmentPlans: readonly InstallmentPlanSummary[],
  referenceDate?: Date,
): NetWorthBreakdown
```

รับ `goldValue` / `resolvedLoans` / `installmentPlans` เป็น argument แทนที่จะเรียก selector เอง — util จึง pure ทดสอบง่าย และไม่ผูกกับ Zustand (แบบเดียวกับ `loanPayments.ts` ที่รับ `years` เข้ามา)

หน้าเว็บเป็นคนประกอบ: `selectGoldSummary` + `useResolvedLoans()` + `selectInstallmentPlans` → `computeNetWorth`

## 6. UI — `src/pages/WealthPage.tsx`

- **Hero:** ตัวเลขสุทธิใหญ่ + ป้าย "ไม่รวมมูลค่าบ้านและรถ" + แถบสัดส่วนสินทรัพย์ vs หนี้
- **สองคอลัมน์:** สินทรัพย์ (เขียว) / หนี้ (แดง) แต่ละแถวมียอด + ป้ายอธิบายเมื่อจำเป็น
  - แถวออมกางดูรายหมวดได้ (Dime, ออมเที่ยว, ฉุกเฉิน, เกษียณ, ทั่วไป)
  - แถวหนี้ระยะยาวกางดูรายก้อนได้ (กยศ, สินเชื่อบ้าน, สินเชื่อบุคคล)
- **Empty state:** ไม่มีข้อมูลเลย → ทุกยอด ฿0 และ netWorth ฿0 (ไม่ใช่ NaN) ไม่ต้องมีหน้าเปล่าพิเศษ
- Sidebar: `{ to: '/wealth', label: 'ความมั่งคั่ง', icon: '💎' }` วางต่อจาก 'วิเคราะห์'

## 7. Verification — `scripts/verify-net-worth.ts`

1. ทองไม่ถูกนับซ้ำ: data มี `goldHoldings` (cost 100,000) + `SavingsItem` หมวด `gold` 100,000 → assets นับทองครั้งเดียว
2. ทองใช้ marketValue เมื่อ > 0; fallback เป็น totalInvested พร้อม `isCostBasis: true` เมื่อ marketValue = 0
3. ออมนับทุกหมวดยกเว้น gold, ข้ามปี/เดือนได้ถูกต้อง
4. หนี้ใช้เงินต้นคงเหลือ ไม่ใช่ ต้น+ดอก (loan 3 งวด ต้น 1000/ดอก 100 → หนี้ = 3,000 ไม่ใช่ 3,300)
5. ผ่อนที่จบแล้ว (`remainingAmount === 0`) ไม่บวก
6. netWorth = assets − liabilities และติดลบได้ (ไม่ floor 0)
7. data ว่างเปล่า → ทุกยอด 0 ไม่มี NaN/undefined
8. `sumBankAllTime` ติดลบ (ถอนมากกว่าฝาก) ยังคำนวณต่อได้ ไม่ throw

บวก `npm run typecheck` + `npm run lint` + `npm run build` + verify เดิมทั้ง 12 ตัวไม่ regress + ขับ UI จริงบน `/wealth`
