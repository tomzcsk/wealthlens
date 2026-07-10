/**
 * Verification for F43 — action feedback messages.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-action-messages.ts
 */
import {
  bankTransactionDeletedMessage,
  expenseDeletedMessage,
  expenseSavedMessage,
  incomeDeletedMessage,
  incomeSavedMessage,
  savingDeletedMessage,
  savingSavedMessage,
} from '../src/utils/actionMessages';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}\n    got:      ${String(a)}\n    expected: ${String(b)}`);
};

// --- รายจ่าย ---------------------------------------------------------------
eq('เพิ่มรายจ่าย ไม่ผูกบัญชี', expenseSavedMessage({ mode: 'add', amount: 1200 }), 'บันทึกรายจ่ายแล้ว');
eq('เพิ่มรายจ่าย ผูกบัญชี → บอกว่าหักจากไหน เท่าไร',
  expenseSavedMessage({ mode: 'add', amount: 1200, accountName: 'กรุงศรี' }),
  'บันทึกรายจ่ายแล้ว · หักจากกรุงศรี ฿1,200');
eq('แก้รายจ่าย ผูกบัญชี',
  expenseSavedMessage({ mode: 'edit', amount: 1200.5, accountName: 'เงินสด' }),
  'แก้ไขรายจ่ายแล้ว · หักจากเงินสด ฿1,200.50');
eq('ลบรายจ่าย ไม่ผูกบัญชี', expenseDeletedMessage({ name: 'ค่าไฟ' }), "ลบ 'ค่าไฟ' แล้ว");
eq('ลบรายจ่าย ผูกบัญชี → บอกว่าคืนยอดให้บัญชีไหน',
  expenseDeletedMessage({ name: 'ค่าไฟ', accountName: 'กรุงศรี' }),
  "ลบ 'ค่าไฟ' แล้ว · คืนยอดกรุงศรี");

// --- รายได้ ---------------------------------------------------------------
eq('บันทึกรายได้ ไม่มีเงินเข้าบัญชี',
  incomeSavedMessage({ mode: 'add', depositedAccounts: [] }), 'บันทึกรายได้แล้ว');
eq('บันทึกรายได้ เข้าบัญชีเดียว',
  incomeSavedMessage({ mode: 'add', depositedAccounts: ['กรุงศรี'] }),
  'บันทึกรายได้แล้ว · เงินเข้ากรุงศรี');
eq('บันทึกรายได้ เข้าสองบัญชี',
  incomeSavedMessage({ mode: 'edit', depositedAccounts: ['กรุงศรี', 'เงินสด'] }),
  'แก้ไขรายได้แล้ว · เงินเข้ากรุงศรี, เงินสด');
eq('ลบรายได้ ไม่มีบัญชีให้คืน',
  incomeDeletedMessage({ month: 3, revertedAccounts: [] }), 'ลบรายได้ เม.ย. แล้ว');
eq('ลบรายได้ คืนยอดบัญชี',
  incomeDeletedMessage({ month: 0, revertedAccounts: ['กรุงศรี'] }),
  'ลบรายได้ ม.ค. แล้ว · คืนยอดกรุงศรี');
eq('ลบรายได้ ธ.ค. (ขอบบน — กัน off-by-one)',
  incomeDeletedMessage({ month: 11, revertedAccounts: [] }), 'ลบรายได้ ธ.ค. แล้ว');
eq('ชื่อบัญชีว่าง → ไม่ต่อท้าย',
  expenseSavedMessage({ mode: 'add', amount: 1200, accountName: '' }), 'บันทึกรายจ่ายแล้ว');

// --- เงินออม --------------------------------------------------------------
eq('เพิ่มเงินออม', savingSavedMessage({ mode: 'add' }), 'บันทึกเงินออมแล้ว');
eq('แก้เงินออม', savingSavedMessage({ mode: 'edit' }), 'แก้ไขเงินออมแล้ว');
eq('ลบเงินออม', savingDeletedMessage({ name: 'ออมเที่ยว' }), "ลบ 'ออมเที่ยว' แล้ว");

// --- รายการเดินบัญชี ------------------------------------------------------
eq('ลบรายการเดินบัญชี → บอกยอดที่ขยับ',
  bankTransactionDeletedMessage({ amount: -500 }), 'ลบรายการแล้ว · ยอดบัญชีปรับ ฿500');
eq('ลบรายการเดินบัญชี ฝั่งเข้า',
  bankTransactionDeletedMessage({ amount: 500 }), 'ลบรายการแล้ว · ยอดบัญชีปรับ ฿500');

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
