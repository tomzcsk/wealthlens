/**
 * Verification for Drive-pull validation (กัน Drive โหลดข้อมูลเสียมาทับ).
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-drive-validation.ts
 *
 * `interpretDrivePayload` เป็น pure fn ที่แปลง text จาก Drive → discriminated result
 * (empty | ok | invalid). ทดสอบว่ามันจับไฟล์เสีย/ผิดรูปได้ และไม่ reject ของที่ valid.
 */
import { interpretDrivePayload } from '../src/utils/driveSync';
import { isDataEmpty } from '../src/utils/dataEmpty';
import type { WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown): void => {
  const ok = got === want;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(got)} (expected ${String(want)})`);
};

// 1. JSON พัง → invalid
eq('JSON พัง → invalid', interpretDrivePayload('{oops').kind, 'invalid');

// 2. JSON valid แต่ไม่ใช่ WealthLensData (`{}`) → invalid (ไม่ใช่ empty)
eq('{} → invalid (ไม่ใช่ empty)', interpretDrivePayload('{}').kind, 'invalid');

// 3. valid WealthLensData ขั้นต่ำ → ok
const minimal = JSON.stringify({
  version: '1.3.0',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  years: {},
});
const r3 = interpretDrivePayload(minimal);
eq('valid ขั้นต่ำ → ok', r3.kind, 'ok');
eq('ok → มี data.years', r3.kind === 'ok' && typeof r3.data.years === 'object', true);

// 4. valid + bank data → ok และเก็บ bankAccounts/bankTransactions ไว้ (round-trip แกนการเงิน)
const withBank = JSON.stringify({
  version: '1.3.0',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  years: {},
  bankAccounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 100 } } }],
  bankTransactions: [
    { id: 't', accountId: 'a', year: 2026, month: 7, amount: 100, label: 'x', source: { type: 'manual' } },
  ],
});
const r4 = interpretDrivePayload(withBank);
eq('valid + bank → ok', r4.kind, 'ok');
eq('ok → bankAccounts คงอยู่', r4.kind === 'ok' && r4.data.bankAccounts?.length, 1);
eq('ok → bankTransactions คงอยู่', r4.kind === 'ok' && r4.data.bankTransactions?.length, 1);

// 5. bankTransactions มี junk member → invalid (แกนการเงิน strict, ไม่ปล่อยผ่าน)
const junkTx = JSON.stringify({
  version: '1.3.0',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  years: {},
  bankTransactions: [42, null, 'nope'],
});
eq('bankTransactions junk → invalid', interpretDrivePayload(junkTx).kind, 'invalid');

// 6. invalid มี reason เป็น string (ไว้ toast/log)
const inv = interpretDrivePayload('{}');
eq('invalid → มี reason string', inv.kind === 'invalid' && typeof inv.reason === 'string', true);

// 7. isDataEmpty รวมข้อมูลบัญชีธนาคาร (Codex review) — บัญชีเดียวก็ไม่ถือว่าว่าง
const emptyData = { years: {} } as unknown as WealthLensData;
eq('ว่างจริง → empty', isDataEmpty(emptyData), true);
const bankOnly = {
  years: {},
  bankAccounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 100 } } }],
} as unknown as WealthLensData;
eq('มีแต่ยอดบัญชี → ไม่ empty', isDataEmpty(bankOnly), false);
const txOnly = {
  years: {},
  bankTransactions: [
    { id: 't', accountId: 'a', year: 2026, month: 7, amount: 100, label: 'x', source: { type: 'manual' } },
  ],
} as unknown as WealthLensData;
eq('มีแต่รายการบัญชี → ไม่ empty', isDataEmpty(txOnly), false);
const acctNoBalance = {
  years: {},
  bankAccounts: [{ id: 'a', name: 'A', balances: {} }],
} as unknown as WealthLensData;
eq('บัญชีเปล่าไม่มียอด → ยัง empty', isDataEmpty(acctNoBalance), true);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
