/**
 * WealthLens — Loans / หนี้สิน manager (F26 + F31 multi-loan, master-detail).
 *
 * Landing shows a grid of loan summary cards when there are 2+ loans; clicking
 * a card opens its full <LoanDetail> with a "← หนี้ทั้งหมด" back button. A
 * single loan skips the list and shows its detail directly. Add/edit/delete
 * and the empty state live here; rendering one loan lives in <LoanDetail>.
 * Store actions (addLoan/updateLoan/deleteLoan) are unchanged.
 */
import { useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import LoanCard from '@/components/loans/LoanCard';
import LoanDetail from '@/components/loans/LoanDetail';
import LoanForm from '@/components/loans/LoanForm';
import { gslLoan } from '@/data/seedData';
import { useResolvedLoans } from '@/hooks/useFinanceData';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import { formatTHB } from '@/utils/formatters';
import { getRemainingBalance } from '@/utils/loanCalculations';

export const LoansPage = (): ReactNode => {
  const seedLoan = useFinanceStore((s) => s.seedLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);
  const pushToast = useToastStore((s) => s.push);

  // Display everywhere uses resolved loans (balances include linked expenses).
  const loans = useResolvedLoans();
  // The edit form must patch the RAW loan — feeding it a resolved loan would
  // let derived expense payments get written back as if they were real.
  const rawLoans = useFinanceStore((s) => s.data.loans) ?? [];

  // Which loan's detail is open. null = show the card list (or, with a single
  // loan, its detail directly).
  const [openId, setOpenId] = useState<string | null>(null);
  // form: null = closed, 'create' = new, {editId} = edit existing
  const [form, setForm] = useState<null | 'create' | { editId: string }>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Card-first always: the list is the landing for any loan count; a loan's
  // detail shows only after its card is opened, with a back button.
  const detailLoan = openId
    ? loans.find((l) => l.id === openId) ?? null
    : null;

  const editingLoan =
    form && form !== 'create'
      ? rawLoans.find((l) => l.id === form.editId) ?? undefined
      : undefined;

  const pendingLoan = pendingDeleteId
    ? loans.find((l) => l.id === pendingDeleteId) ?? null
    : null;

  const handleDelete = (): void => {
    if (!pendingDeleteId) return;
    deleteLoan(pendingDeleteId, { revertExpenseSideEffects: true });
    setPendingDeleteId(null);
    setOpenId(null);
    pushToast({ message: 'ลบหนี้แล้ว', tone: 'info' });
  };

  // ชื่อหน้า/แท็บเป็นของ DebtPage แล้ว — ที่นี่เหลือแค่คำบรรยาย + ปุ่มเพิ่มหนี้
  // เพื่อไม่ให้หัวข้อซ้อนกัน.
  const header = (
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-500">
        ตารางผ่อน + ประวัติชำระ ของหนี้ระยะยาว
      </p>
      {loans.length > 0 && (
        <button
          type="button"
          onClick={() => setForm('create')}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition"
        >
          + เพิ่มหนี้
        </button>
      )}
    </div>
  );

  const addEditModal = (
    <Modal
      open={form != null}
      onClose={() => setForm(null)}
      title={form === 'create' ? 'เพิ่มหนี้' : 'แก้ไขหนี้'}
      size="lg"
    >
      <div className="px-6 py-5">
        <LoanForm
          key={form === 'create' ? 'new' : editingLoan?.id ?? 'edit'}
          initialLoan={editingLoan}
          onSaved={() => setForm(null)}
          onCancel={() => setForm(null)}
        />
      </div>
    </Modal>
  );

  // --- Empty state ---
  if (loans.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center space-y-4">
          <p className="text-sm text-slate-500">ยังไม่มีข้อมูลหนี้</p>
          <button
            type="button"
            onClick={() => setForm('create')}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition"
          >
            + เพิ่มหนี้
          </button>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                seedLoan(gslLoan);
                pushToast({ message: 'โหลด กยศ ตัวอย่างแล้ว', tone: 'success' });
              }}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              โหลด กยศ ตัวอย่าง (ของ Tom)
            </button>
          </div>
        </div>
        {addEditModal}
      </div>
    );
  }

  // --- Populated ---
  return (
    <div className="space-y-6">
      {header}

      {detailLoan ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              ← หนี้ทั้งหมด
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm({ editId: detailLoan.id })}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(detailLoan.id)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-expense hover:bg-red-50"
              >
                ลบ
              </button>
            </div>
          </div>
          <LoanDetail loan={detailLoan} />
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loans.map((l) => (
            <LoanCard key={l.id} loan={l} onOpen={() => setOpenId(l.id)} />
          ))}
        </div>
      )}

      {addEditModal}

      {/* Delete confirm */}
      <Modal
        open={pendingDeleteId != null}
        onClose={() => setPendingDeleteId(null)}
        title="ลบหนี้ก้อนนี้"
        size="sm"
      >
        {pendingLoan && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-700">
              ลบ{' '}
              <span className="font-semibold">{pendingLoan.name}</span>{' '}
              (ยอดคงเหลือ{' '}
              <span className="financial-number tabular-nums">
                {formatTHB(getRemainingBalance(pendingLoan), { decimals: 0 })}
              </span>
              ) และประวัติโปะทั้งหมด — พร้อม revert ค่าใช้จ่ายที่ลิงก์ไว้
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-expense px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                ลบหนี้
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LoansPage;
