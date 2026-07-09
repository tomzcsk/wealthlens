/**
 * WealthLens — Bank Accounts (F33) create/edit form.
 *
 * Picking a bank chip from THAI_BANKS sets both `bankKey` and (unless the
 * user already typed something custom) a sensible default display name.
 * "อื่นๆ (พิมพ์เอง)" clears bankKey for a fully custom account — the neutral
 * 🏦 avatar shows until/unless the typed name happens to match a bank alias.
 */
import { useState, type FormEvent, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { BankAccount, BankAccountType } from '@/types';
import { THAI_BANKS, resolveBank, bankByKey } from '@/data/thaiBanks';
import BankAvatar from './BankAvatar';

export interface BankAccountFormProps {
  initialAccount?: BankAccount;
  onSaved: () => void;
  onCancel: () => void;
}

export const BankAccountForm = ({
  initialAccount,
  onSaved,
  onCancel,
}: BankAccountFormProps): ReactNode => {
  const addBankAccount = useFinanceStore((s) => s.addBankAccount);
  const updateBankAccount = useFinanceStore((s) => s.updateBankAccount);
  const pushToast = useToastStore((s) => s.push);

  const [bankKey, setBankKey] = useState<string | null>(
    initialAccount ? resolveBank(initialAccount)?.key ?? null : null,
  );
  const [name, setName] = useState<string>(initialAccount?.name ?? '');
  const [type, setType] = useState<BankAccountType>(
    initialAccount?.type ?? 'other',
  );
  const [error, setError] = useState<string | null>(null);

  const handlePickBank = (key: string): void => {
    const bank = bankByKey(key);
    if (!bank) return;
    const prevLabel = bankKey ? bankByKey(bankKey)?.label : undefined;
    if (!name.trim() || name === prevLabel) {
      setName(bank.label);
    }
    setBankKey(key);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('กรอกชื่อบัญชี');
      return;
    }

    if (initialAccount) {
      updateBankAccount(initialAccount.id, {
        name: trimmed,
        bankKey: bankKey ?? null,
        type,
      });
      pushToast({ message: 'แก้ไขบัญชีแล้ว', tone: 'success' });
    } else {
      addBankAccount(trimmed, bankKey ?? undefined, type);
      pushToast({ message: 'เพิ่มบัญชีแล้ว', tone: 'success' });
    }
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className="block text-sm font-medium text-slate-700 mb-2">ธนาคาร</span>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {THAI_BANKS.map((b) => (
            <button
              key={b.key}
              type="button"
              aria-pressed={bankKey === b.key}
              onClick={() => handlePickBank(b.key)}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                bankKey === b.key
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <BankAvatar account={{ name: b.label, bankKey: b.key }} size="sm" />
              <span className="text-slate-700">{b.label}</span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={bankKey === null}
            onClick={() => setBankKey(null)}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              bankKey === null
                ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 font-semibold px-2 py-1 text-[10px] min-w-[2.5rem]"
              aria-hidden="true"
            >
              🏦
            </span>
            <span className="text-slate-700">อื่นๆ (พิมพ์เอง)</span>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          ชื่อบัญชี
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น กรุงศรี, กสิกร"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          ประเภทบัญชี
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BankAccountType)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="salary">บัญชีเงินเดือน</option>
            <option value="savings">บัญชีออมทรัพย์</option>
            <option value="cash">เงินสด</option>
            <option value="other">อื่นๆ</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            ใช้ตั้งค่าเริ่มต้นว่าเงินเดือนจะเข้าบัญชีไหน
          </span>
        </label>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          บันทึก
        </button>
      </div>
    </form>
  );
};

export default BankAccountForm;
