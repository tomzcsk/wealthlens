/**
 * WealthLens — Bank Accounts / บัญชีธนาคาร manager (F33, master-detail).
 *
 * Mirrors LoansPage.tsx: card grid landing → click a card → full detail
 * with a "← บัญชีทั้งหมด" back button. Add/edit/delete and the empty
 * state live here; rendering one account lives in <BankAccountDetail>.
 * Kept (กรุงศรี) auto-migrates into an account here — no seed button.
 */
import { useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import BankAccountCard from '@/components/accounts/BankAccountCard';
import BankAccountDetail from '@/components/accounts/BankAccountDetail';
import BankAccountForm from '@/components/accounts/BankAccountForm';
import { resolveBank } from '@/data/thaiBanks';
import { useFinanceStore } from '@/stores/financeStore';
import { EMPTY_BANK_ACCOUNTS } from '@/stores/emptyRefs';
import { useToastStore } from '@/stores/toastStore';
import { sumBankAllTime, sumBankYear } from '@/utils/bankAccounts';
import { formatTHB } from '@/utils/formatters';

export const BankAccountsPage = (): ReactNode => {
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);
  const year = useFinanceStore((s) => s.selectedYear);
  const deleteBankAccount = useFinanceStore((s) => s.deleteBankAccount);
  const pushToast = useToastStore((s) => s.push);

  // Which account's detail is open. null = show the card list.
  const [openId, setOpenId] = useState<string | null>(null);
  // form: null = closed, 'create' = new, {editId} = edit existing
  const [form, setForm] = useState<null | 'create' | { editId: string }>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const detailAccount = openId
    ? accounts.find((a) => a.id === openId) ?? null
    : null;

  const editingAccount =
    form && form !== 'create'
      ? accounts.find((a) => a.id === form.editId) ?? undefined
      : undefined;

  const pendingAccount = pendingDeleteId
    ? accounts.find((a) => a.id === pendingDeleteId) ?? null
    : null;

  const handleDelete = (): void => {
    if (!pendingDeleteId) return;
    deleteBankAccount(pendingDeleteId);
    setPendingDeleteId(null);
    setOpenId(null);
    pushToast({ message: 'ลบบัญชีแล้ว', tone: 'info' });
  };

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          🏦 บัญชีธนาคาร
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          ยอดเงินออมแต่ละบัญชี รายเดือน
        </p>
      </div>
      {accounts.length > 0 && (
        <button
          type="button"
          onClick={() => setForm('create')}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition"
        >
          + เพิ่มบัญชี
        </button>
      )}
    </div>
  );

  const addEditModal = (
    <Modal
      open={form != null}
      onClose={() => setForm(null)}
      title={form === 'create' ? 'เพิ่มบัญชี' : 'แก้ไขชื่อบัญชี'}
      size="sm"
    >
      <div className="px-6 py-5">
        <BankAccountForm
          key={form === 'create' ? 'new' : editingAccount?.id ?? 'edit'}
          initialAccount={editingAccount}
          onSaved={() => setForm(null)}
          onCancel={() => setForm(null)}
        />
      </div>
    </Modal>
  );

  // --- Empty state ---
  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center space-y-4">
          <p className="text-sm text-slate-500">ยังไม่มีบัญชีธนาคาร</p>
          <button
            type="button"
            onClick={() => setForm('create')}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition"
          >
            + เพิ่มบัญชี
          </button>
        </div>
        {addEditModal}
      </div>
    );
  }

  // --- Populated ---
  return (
    <div className="space-y-6">
      {header}

      {detailAccount ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              ← บัญชีทั้งหมด
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm({ editId: detailAccount.id })}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(detailAccount.id)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-expense hover:bg-red-50"
              >
                ลบ
              </button>
            </div>
          </div>
          <BankAccountDetail account={detailAccount} />
        </>
      ) : (
        <>
          {(() => {
            const totalAll = sumBankAllTime(accounts);
            const totalYear = sumBankYear(accounts, year);
            return (
              <section className="rounded-2xl bg-slate-900 text-white shadow-sm p-6 sm:p-8">
                <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                  ยอดรวมทุกบัญชี
                </div>
                <div
                  className={`mt-2 text-4xl sm:text-5xl font-bold financial-number tabular-nums tracking-tight ${
                    totalAll < 0 ? 'text-red-300' : 'text-white'
                  }`}
                >
                  {formatTHB(totalAll, { decimals: 0 })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                    {accounts.length} บัญชี
                  </span>
                  <span>·</span>
                  <span>
                    ปี {year}{' '}
                    <span
                      className={`financial-number tabular-nums ${
                        totalYear < 0 ? 'text-red-300' : 'text-slate-200'
                      }`}
                    >
                      {formatTHB(totalYear, { decimals: 0 })}
                    </span>
                  </span>
                </div>
              </section>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...accounts]
              .sort(
                (a, b) =>
                  (resolveBank(a)?.key === 'cash' ? 0 : 1) -
                  (resolveBank(b)?.key === 'cash' ? 0 : 1),
              )
              .map((a) => (
                <BankAccountCard
                  key={a.id}
                  account={a}
                  year={year}
                  onOpen={() => setOpenId(a.id)}
                />
              ))}
          </div>
        </>
      )}

      {addEditModal}

      {/* Delete confirm */}
      <Modal
        open={pendingDeleteId != null}
        onClose={() => setPendingDeleteId(null)}
        title="ลบบัญชีนี้"
        size="sm"
      >
        {pendingAccount && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-700">
              ลบบัญชี{' '}
              <span className="font-semibold">{pendingAccount.name}</span>{' '}
              และยอดทั้งหมด?
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
                ลบบัญชี
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BankAccountsPage;
